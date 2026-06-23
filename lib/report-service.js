const MAX_ROWS = Number(process.env.MAX_ROWS || 1000);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function createErpReport({ csvText, fileName, analysisGoal, companyName }) {
  if (!csvText || typeof csvText !== "string") {
    throw httpError(400, "분석할 ERP CSV 파일을 업로드해 주세요.");
  }

  const parsed = parseCsv(csvText);
  if (parsed.rows.length === 0) {
    throw httpError(400, "CSV에서 분석할 데이터 행을 찾지 못했습니다.");
  }

  const profile = profileDataset(parsed.headers, parsed.rows);
  const dashboard = buildDashboard(profile, parsed.rows);
  const report = await buildAiReport({
    fileName: fileName || "erp-data.csv",
    companyName: String(companyName || "").trim() || "우리 회사",
    analysisGoal: String(analysisGoal || "").trim() || "ERP 데이터 기반 경영 현황 진단",
    profile,
    dashboard
  });

  return {
    fileName: fileName || "erp-data.csv",
    generatedAt: new Date().toISOString(),
    headers: parsed.headers,
    rows: parsed.rows.slice(0, 200),
    profile,
    dashboard,
    report
  };
}

function parseCsv(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const records = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
    } else if (char === "\n" && !inQuotes) {
      row.push(field.trim());
      if (row.some((value) => value !== "")) {
        records.push(row);
      }
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value !== "")) {
    records.push(row);
  }

  if (records.length < 2) {
    throw httpError(400, "CSV에는 헤더와 최소 1개 이상의 데이터 행이 필요합니다.");
  }

  const headers = records[0].map((header, index) => header || `컬럼 ${index + 1}`);
  const rows = records.slice(1, MAX_ROWS + 1).map((record) => {
    return headers.reduce((entry, header, index) => {
      entry[header] = record[index] ?? "";
      return entry;
    }, {});
  });

  return { headers, rows };
}

function profileDataset(headers, rows) {
  const columns = headers.map((name) => {
    const values = rows.map((row) => row[name]).filter((value) => value !== "");
    const numbers = values.map(parseNumber).filter((value) => Number.isFinite(value));
    const dates = values.map(parseDate).filter(Boolean);
    const uniqueValues = countBy(values).slice(0, 12);
    const numericRatio = values.length ? numbers.length / values.length : 0;
    const dateRatio = values.length ? dates.length / values.length : 0;
    const type = dateRatio >= 0.65 ? "date" : numericRatio >= 0.65 ? "number" : "category";

    return {
      name,
      type,
      filledCount: values.length,
      emptyCount: rows.length - values.length,
      uniqueCount: new Set(values).size,
      min: numbers.length ? Math.min(...numbers) : null,
      max: numbers.length ? Math.max(...numbers) : null,
      sum: numbers.length ? round(numbers.reduce((total, value) => total + value, 0)) : null,
      avg: numbers.length ? round(numbers.reduce((total, value) => total + value, 0) / numbers.length) : null,
      topValues: uniqueValues
    };
  });

  return {
    rowCount: rows.length,
    columnCount: headers.length,
    columns,
    numericColumns: columns.filter((column) => column.type === "number"),
    dateColumns: columns.filter((column) => column.type === "date"),
    categoryColumns: columns.filter((column) => column.type === "category")
  };
}

function buildDashboard(profile, rows) {
  const primaryMetric = findColumn(profile.numericColumns, ["매출", "sales", "revenue", "amount", "금액", "합계", "total"]) || profile.numericColumns[0];
  const costMetric = findColumn(profile.numericColumns, ["원가", "비용", "cost", "expense", "매입"]);
  const quantityMetric = findColumn(profile.numericColumns, ["수량", "quantity", "qty", "건수", "count"]);
  const dateColumn = profile.dateColumns[0];
  const categoryColumn =
    findColumn(profile.categoryColumns, ["부서", "department", "거래처", "customer", "제품", "product", "품목", "category"]) ||
    profile.categoryColumns[0];

  const kpis = [
    {
      label: primaryMetric ? `${primaryMetric.name} 합계` : "총 데이터 행",
      value: primaryMetric ? primaryMetric.sum : profile.rowCount,
      format: primaryMetric ? "number" : "integer"
    },
    {
      label: primaryMetric ? `${primaryMetric.name} 평균` : "컬럼 수",
      value: primaryMetric ? primaryMetric.avg : profile.columnCount,
      format: primaryMetric ? "number" : "integer"
    },
    {
      label: costMetric ? `${costMetric.name} 합계` : "숫자 컬럼",
      value: costMetric ? costMetric.sum : profile.numericColumns.length,
      format: costMetric ? "number" : "integer"
    },
    {
      label: quantityMetric ? `${quantityMetric.name} 합계` : "범주 컬럼",
      value: quantityMetric ? quantityMetric.sum : profile.categoryColumns.length,
      format: quantityMetric ? "number" : "integer"
    }
  ];

  return {
    kpis,
    charts: {
      category: categoryColumn ? buildCategoryChart(categoryColumn) : null,
      numeric: primaryMetric ? buildNumericChart(primaryMetric) : null,
      trend: dateColumn && primaryMetric ? buildTrendChart(rows, dateColumn, primaryMetric) : null
    },
    table: profile.columns.map((column) => ({
      column: column.name,
      type: column.type,
      filledCount: column.filledCount,
      uniqueCount: column.uniqueCount,
      sum: column.sum,
      avg: column.avg,
      min: column.min,
      max: column.max
    }))
  };
}

function buildCategoryChart(column) {
  return {
    title: `${column.name} 상위 분포`,
    labels: column.topValues.slice(0, 8).map((item) => item.label),
    values: column.topValues.slice(0, 8).map((item) => item.value)
  };
}

function buildNumericChart(column) {
  const stats = [
    ["최소", column.min],
    ["평균", column.avg],
    ["최대", column.max]
  ].filter(([, value]) => value != null);

  return {
    title: `${column.name} 요약 통계`,
    labels: stats.map(([label]) => label),
    values: stats.map(([, value]) => value)
  };
}

function buildTrendChart(rows, dateColumn, metricColumn) {
  const buckets = new Map();
  rows.forEach((row) => {
    const date = parseDate(row[dateColumn.name]);
    const value = parseNumber(row[metricColumn.name]);
    if (!date || !Number.isFinite(value)) {
      return;
    }
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, round((buckets.get(key) || 0) + value));
  });

  const entries = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  return {
    title: `${dateColumn.name} 기준 ${metricColumn.name} 추세`,
    labels: entries.map(([label]) => label),
    values: entries.map(([, value]) => value)
  };
}

async function buildAiReport({ fileName, companyName, analysisGoal, profile, dashboard }) {
  const fallback = buildFallbackReport({ fileName, companyName, analysisGoal, profile, dashboard });

  if (!process.env.GEMINI_API_KEY) {
    return fallback;
  }

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationConfig: { temperature: 0.25 },
        contents: [
          {
            role: "user",
            parts: [{ text: buildGeminiPrompt({ fileName, companyName, analysisGoal, profile, dashboard }) }]
          }
        ]
      })
    });

    if (!response.ok) {
      return fallback;
    }

    const payload = await response.json();
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text
      ? { ...fallback, executiveSummary: text, generatedBy: "Gemini AI" }
      : fallback;
  } catch {
    return fallback;
  }
}

function buildFallbackReport({ fileName, companyName, analysisGoal, profile, dashboard }) {
  const numericNames = profile.numericColumns.map((column) => column.name).join(", ") || "없음";
  const categoryNames = profile.categoryColumns.slice(0, 5).map((column) => column.name).join(", ") || "없음";
  const topKpi = dashboard.kpis[0];

  return {
    title: `${companyName} ERP 경영 분석 보고서`,
    generatedBy: "규칙 기반 분석",
    executiveSummary: `${fileName}의 ${profile.rowCount.toLocaleString("ko-KR")}개 ERP 행과 ${profile.columnCount}개 컬럼을 기준으로 "${analysisGoal}" 관점의 대시보드를 생성했습니다. 핵심 지표는 ${topKpi.label} ${formatNumber(topKpi.value)}이며, 숫자 컬럼(${numericNames})과 범주 컬럼(${categoryNames})을 중심으로 매출, 비용, 수량, 거래처 또는 부서별 현황을 빠르게 점검할 수 있습니다.`,
    findings: [
      `총 ${profile.rowCount.toLocaleString("ko-KR")}개 행을 분석했으며 숫자 컬럼은 ${profile.numericColumns.length}개, 범주 컬럼은 ${profile.categoryColumns.length}개입니다.`,
      `${topKpi.label}은 ${formatNumber(topKpi.value)}로 집계되어 가장 먼저 확인해야 할 대표 KPI입니다.`,
      "비어 있는 값이 많은 컬럼은 원천 ERP 입력 품질 점검 대상입니다."
    ],
    recommendations: [
      "매출, 원가, 수량 컬럼명을 표준화하면 자동 KPI 정확도가 높아집니다.",
      "부서, 거래처, 제품 같은 범주 컬럼을 기준으로 상위 기여도를 매주 비교하세요.",
      "날짜 컬럼이 포함된 CSV를 업로드하면 기간별 추세 리포트로 확장하기 쉽습니다."
    ],
    riskNotes: [
      "이 보고서는 업로드된 CSV 범위 안에서만 분석합니다.",
      "회계 확정값이 아닌 운영 ERP 추출본이라면 마감 조정액과 차이가 있을 수 있습니다."
    ]
  };
}

function buildGeminiPrompt({ fileName, companyName, analysisGoal, profile, dashboard }) {
  return `
당신은 ERP 데이터를 분석하는 경영 컨설턴트입니다.
아래 CSV 프로파일과 대시보드 지표만 근거로 한국어 경영 분석 보고서를 작성하세요.
추측한 수치를 만들지 말고, 데이터 품질 한계도 짚어 주세요.

회사명: ${companyName}
파일명: ${fileName}
분석 목적: ${analysisGoal}
행 수: ${profile.rowCount}
컬럼 수: ${profile.columnCount}
숫자 컬럼: ${profile.numericColumns.map((column) => `${column.name}(합계 ${formatNumber(column.sum)}, 평균 ${formatNumber(column.avg)})`).join(", ") || "없음"}
범주 컬럼: ${profile.categoryColumns.map((column) => `${column.name}(고유값 ${column.uniqueCount})`).join(", ") || "없음"}
KPI: ${dashboard.kpis.map((kpi) => `${kpi.label} ${formatNumber(kpi.value)}`).join(", ")}

보고서 형식:
1. 경영진 요약
2. 핵심 KPI 해석
3. 표와 그래프에서 확인되는 포인트
4. 리스크와 데이터 품질 이슈
5. 실행 권고안
`.trim();
}

function findColumn(columns, candidates) {
  return columns.find((column) => {
    const name = column.name.toLowerCase();
    return candidates.some((candidate) => name.includes(candidate.toLowerCase()));
  });
}

function countBy(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function parseNumber(value) {
  const normalized = String(value || "").replace(/[,\s원$%]/g, "");
  if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) {
    return NaN;
  }
  return Number(normalized);
}

function parseDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const looksLikeDate =
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(text) ||
    /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(text) ||
    /^\d{8}$/.test(text);
  if (!looksLikeDate) return null;
  const normalized = /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = {
  createErpReport
};
