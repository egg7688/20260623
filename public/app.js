const form = document.querySelector("#report-form");
const statusEl = document.querySelector("#status");
const reportEl = document.querySelector("#report");
const submitButton = document.querySelector("#submit-button");
const sampleButton = document.querySelector("#sample-button");
const externalReportUrl = "https://erp-five-lemon.vercel.app/report";

let currentPayload = null;

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const file = formData.get("csvFile");
  if (!file || !file.name) {
    setStatus("ERP CSV 파일을 선택해 주세요.", true);
    return;
  }

  await generateDashboard({
    companyName: formData.get("companyName"),
    analysisGoal: formData.get("analysisGoal"),
    fileName: file.name,
    csvText: await file.text()
  });
});

sampleButton.addEventListener("click", async () => {
  const companyNameInput = document.querySelector("#company-name");
  const analysisGoalInput = document.querySelector("#analysis-goal");

  setLoading(true);
  setStatus("서버에서 샘플 ERP 데이터를 가져오는 중입니다...");

  try {
    const response = await fetch("/api/sample-data");
    const sample = await response.json();
    if (!response.ok) {
      throw new Error(sample.message || "샘플 데이터를 가져오지 못했습니다.");
    }

    companyNameInput.value = companyNameInput.value || sample.companyName;
    analysisGoalInput.value = analysisGoalInput.value || sample.analysisGoal;

    await generateDashboard({
      ...sample,
      companyName: companyNameInput.value,
      analysisGoal: analysisGoalInput.value
    });
  } catch (error) {
    setStatus(error.message, true);
    setLoading(false);
  }
});

document.addEventListener("click", async (event) => {
  if (!event.target.matches("[data-import-external]")) {
    return;
  }

  const companyName = document.querySelector("#company-name").value || "외부 ERP 리포트";
  const analysisGoal = document.querySelector("#analysis-goal").value || "외부 ERP 리포트 URL 기반 경영 분석";
  await generateDashboardFromUrl({
    companyName,
    analysisGoal,
    sourceUrl: externalReportUrl
  });
});

async function generateDashboard(payload) {
  setLoading(true);
  setStatus("CSV를 분석하고 Gemini AI 보고서를 작성하는 중입니다...");
  reportEl.classList.add("hidden");
  reportEl.innerHTML = "";

  try {
    const response = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "요청에 실패했습니다.");
    }

    currentPayload = data;
    renderReport(data);
    setStatus("대시보드와 분석보고서가 생성되었습니다. PDF 또는 Word로 다운로드할 수 있습니다.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function generateDashboardFromUrl(payload) {
  setLoading(true);
  setStatus("외부 ERP URL에서 데이터를 가져와 대시보드를 생성하는 중입니다...");
  reportEl.classList.add("hidden");
  reportEl.innerHTML = "";

  try {
    const response = await fetch("/api/import-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "외부 URL 데이터를 가져오지 못했습니다.");
    }

    currentPayload = data;
    renderReport(data);
    setStatus("외부 ERP URL 데이터로 대시보드와 분석보고서가 생성되었습니다.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
}

function renderReport(payload) {
  const { dashboard, profile, report, rows } = payload;
  const charts = [
    dashboard.charts.category ? renderBarChart(dashboard.charts.category) : "",
    dashboard.charts.numeric ? renderBarChart(dashboard.charts.numeric) : "",
    dashboard.charts.trend ? renderBarChart(dashboard.charts.trend) : ""
  ].join("");

  reportEl.innerHTML = `
    <div class="report-header">
      <p class="eyebrow">Generated Dashboard</p>
      <h2>${escapeHtml(report.title)}</h2>
      <p class="muted">파일: ${escapeHtml(payload.fileName)} · 생성일: ${new Date(payload.generatedAt).toLocaleString("ko-KR")} · 작성: ${escapeHtml(report.generatedBy)}</p>
      ${payload.sourceNotice ? `<p class="notice">${escapeHtml(payload.sourceNotice)}</p>` : ""}
      <div class="download-actions">
        <button type="button" data-download="pdf">PDF 다운로드</button>
        <button type="button" data-download="word" class="secondary-button">Word 다운로드</button>
        <button type="button" data-import-external class="secondary-button">외부 URL 확인 후 생성</button>
      </div>
    </div>

    <section class="kpi-grid">${dashboard.kpis.map(renderKpi).join("")}</section>

    <section class="report-section">
      <div class="section-heading">
        <p class="eyebrow">AI Management Report</p>
        <h3>Gemini AI 분석보고서</h3>
      </div>
      <div class="summary">${formatText(report.executiveSummary)}</div>
    </section>

    <section class="insights">
      ${report.findings.map((item) => renderInsight("핵심 발견", item)).join("")}
      ${report.recommendations.map((item) => renderInsight("실행 권고", item)).join("")}
      ${report.riskNotes.map((item) => renderInsight("리스크", item)).join("")}
    </section>

    <section class="chart-grid">${charts}</section>

    <section class="report-section">
      <div class="section-heading">
        <p class="eyebrow">Data Table</p>
        <h3>컬럼 품질과 통계</h3>
      </div>
      ${renderColumnTable(dashboard.table)}
    </section>

    <section class="report-section">
      <div class="section-heading">
        <p class="eyebrow">CSV Preview</p>
        <h3>ERP 원본 데이터 미리보기</h3>
        <p class="muted">${profile.rowCount.toLocaleString("ko-KR")}개 행 중 최대 20개 행을 표시합니다.</p>
      </div>
      ${renderPreviewTable(rows.slice(0, 20))}
    </section>
  `;

  bindDownloadButtons();
  reportEl.classList.remove("hidden");
}

function renderKpi(kpi) {
  return `
    <article class="kpi-card">
      <span>${escapeHtml(kpi.label)}</span>
      <strong>${formatNumber(kpi.value)}</strong>
    </article>
  `;
}

function renderInsight(label, body) {
  return `
    <article class="insight-card">
      <p class="eyebrow">${escapeHtml(label)}</p>
      <p>${escapeHtml(body)}</p>
    </article>
  `;
}

function renderBarChart(chart) {
  if (!chart?.labels?.length) {
    return "";
  }

  const max = Math.max(...chart.values.map((value) => Math.abs(Number(value) || 0)), 1);
  const bars = chart.labels
    .map((label, index) => {
      const value = Number(chart.values[index]) || 0;
      const width = Math.max(4, Math.round((Math.abs(value) / max) * 100));
      return `
        <div class="bar-row">
          <span>${escapeHtml(label)}</span>
          <div class="bar-track"><div class="bar" style="width:${width}%"></div></div>
          <strong>${formatNumber(value)}</strong>
        </div>
      `;
    })
    .join("");

  return `
    <article class="chart-card">
      <h3>${escapeHtml(chart.title)}</h3>
      ${bars}
    </article>
  `;
}

function renderColumnTable(rows) {
  return renderTable(["컬럼", "유형", "입력 행", "고유값", "합계", "평균", "최소", "최대"], rows.map((row) => [
    row.column,
    row.type,
    row.filledCount,
    row.uniqueCount,
    row.sum ?? "-",
    row.avg ?? "-",
    row.min ?? "-",
    row.max ?? "-"
  ]));
}

function renderPreviewTable(rows) {
  if (!rows.length) {
    return "<p>미리볼 데이터가 없습니다.</p>";
  }

  const headers = Object.keys(rows[0]);
  return renderTable(headers, rows.map((row) => headers.map((header) => row[header])));
}

function renderTable(headers, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(formatCell(cell))}</td>`).join("")}</tr>`)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function bindDownloadButtons() {
  reportEl.querySelector('[data-download="pdf"]')?.addEventListener("click", () => {
    window.print();
  });

  reportEl.querySelector('[data-download="word"]')?.addEventListener("click", () => {
    if (!currentPayload) {
      return;
    }

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${escapeHtml(currentPayload.report.title)}</title>
          <style>
            body { font-family: Malgun Gothic, Arial, sans-serif; color: #172033; }
            table { border-collapse: collapse; width: 100%; margin: 16px 0; }
            th, td { border: 1px solid #d9e1ef; padding: 8px; text-align: left; }
            .bar-track { background: #edf2ff; height: 12px; }
            .bar { background: #3857df; height: 12px; }
          </style>
        </head>
        <body>${reportEl.innerHTML}</body>
      </html>
    `;
    downloadFile(`${toSafeFilename(currentPayload.report.title)}.doc`, html, "application/msword;charset=utf-8");
  });
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatText(value) {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function formatCell(value) {
  if (typeof value === "number") {
    return formatNumber(value);
  }
  return value ?? "-";
}

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function toSafeFilename(value) {
  return String(value || "erp-report")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "erp-report";
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  sampleButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "분석 중..." : "대시보드 생성";
  sampleButton.textContent = isLoading ? "분석 중..." : "샘플 데이터 가져와 생성";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
