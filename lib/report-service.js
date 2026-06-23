const MAX_ROWS = Number(process.env.MAX_ROWS || 1000);

const SAMPLE_ERP_CSV = `일자,부서,거래처,제품,매출,비용,수량
2026-01-05,영업1팀,A상사,ERP Basic,1200000,720000,3
2026-01-12,영업2팀,B전자,ERP Pro,2500000,1400000,5
2026-01-23,영업3팀,C물산,ERP Analytics,1800000,950000,2
2026-02-03,영업1팀,A상사,ERP Basic,980000,610000,2
2026-02-17,영업2팀,D테크,ERP Pro,3100000,1720000,6
2026-02-26,영업3팀,E유통,ERP Analytics,2100000,1200000,3
2026-03-08,영업1팀,F제조,ERP Basic,1350000,760000,4
2026-03-15,영업2팀,B전자,ERP Pro,2800000,1510000,5
2026-03-29,영업3팀,C물산,ERP Analytics,2400000,1320000,4
2026-04-06,영업1팀,A상사,ERP Basic,1650000,890000,5
2026-04-18,영업2팀,D테크,ERP Pro,3400000,1840000,7
2026-04-27,영업3팀,E유통,ERP Analytics,2600000,1430000,4`;

async function createErpReport({ csvText, fileName, analysisGoal, companyName, sourceNotice }) {
  if (!csvText || typeof csvText !== "string") {
    throw httpError(400, "분석할 ERP CSV 파일을 업로드해 주세요.");
  }

  const parsed = parseCsv(csvText);
  if (parsed.rows.length === 0) {
    throw httpError(400, "CSV에서 분석할 데이터 행을 찾지 못했습니다.");
  }

  const profile = profileDataset(parsed.headers, parsed.rows);
  const dashboard = buildDashboard(profile, parsed.rows);
  const normalizedCompanyName = String(companyName || "").trim() || "우리 회사";
  const normalizedAnalysisGoal = String(analysisGoal || "").trim() || "ERP 데이터 기반 경영 현황 진단";

  return {
    title: `${normalizedCompanyName} ERP 경영 대시보드`,
    companyName: normalizedCompanyName,
    analysisGoal: normalizedAnalysisGoal,
    fileName: fileName || "erp-data.csv",
    generatedAt: new Date().toISOString(),
    headers: parsed.headers,
    rows: parsed.rows.slice(0, 200),
    profile,
    dashboard,
    sourceNotice: sourceNotice || ""
  };
}

async function createErpReportFromUrl({ sourceUrl, analysisGoal, companyName }) {
  const url = parseSourceUrl(sourceUrl);
  const response = await fetch(url, {
    headers: {
      Accept: "text/csv, application/json, text/html;q=0.9, */*;q=0.8",
      "User-Agent": "ERP-Dashboard/1.0"
    }
  });

  if (!response.ok) {
    throw httpError(response.status, `외부 ERP URL을 가져오지 못했습니다. (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  let csvText;
  let sourceNotice = "";

  try {
    csvText = extractCsvFromRemoteBody(body, contentType, url);
  } catch (error) {
    if (!shouldFallbackToSample(error, body)) {
      throw error;
    }

    const sample = getSampleErpData();
    csvText = sample.csvText;
    sourceNotice = `${url}에서 실제 ERP 행 데이터를 찾지 못해 내장 샘플 ERP 데이터로 대시보드를 생성했습니다.`;
  }

  return createErpReport({
    csvText,
    fileName: `${new URL(url).hostname}-report.csv`,
    analysisGoal: analysisGoal || `외부 ERP 리포트 URL(${url}) 기반 경영 분석`,
    companyName: companyName || "외부 ERP 리포트",
    sourceNotice
  });
}

async function createErpReportFromGoogleSheet({ spreadsheet, range, analysisGoal, companyName }) {
  const spreadsheetId = parseSpreadsheetId(spreadsheet);
  const normalizedRange = String(range || "").trim() || "A:Z";
  const credential = getGoogleCredential();
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(normalizedRange)}`
  );

  const headers = { Accept: "application/json" };
  if (credential.type === "key") {
    url.searchParams.set("key", credential.value);
  } else {
    headers.Authorization = `Bearer ${credential.value}`;
  }

  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Google Sheets 데이터를 가져오지 못했습니다. (${response.status})`;
    throw httpError(response.status, message);
  }

  const csvText = sheetValuesToCsv(payload.values);
  return createErpReport({
    csvText,
    fileName: `google-sheet-${spreadsheetId.slice(0, 8)}.csv`,
    analysisGoal: analysisGoal || "Google Sheets ERP 데이터 기반 경영 분석",
    companyName: companyName || "Google Sheets ERP",
    sourceNotice: `Google Sheets API에서 ${normalizedRange} 범위를 가져와 대시보드를 생성했습니다.`
  });
}

function getSampleErpData() {
  return {
    companyName: "커서상사",
    analysisGoal: "샘플 ERP 데이터 기반 매출과 비용 구조 진단",
    fileName: "sample-erp-sales.csv",
    csvText: SAMPLE_ERP_CSV
  };
}

function getGoogleCredential() {
  const apiKey = String(process.env.GOOGLE_API_KEY || "").trim();
  if (apiKey) {
    return { type: "key", value: apiKey };
  }

  const accessToken = String(process.env.GOOGLE_ACCESS_TOKEN || "").trim();
  if (accessToken) {
    return { type: "accessToken", value: accessToken };
  }

  throw httpError(500, "서버 환경변수 GOOGLE_API_KEY 또는 GOOGLE_ACCESS_TOKEN을 설정해 주세요.");
}

function parseSpreadsheetId(value) {
  const text = String(value || "").trim();
  if (!text) {
    throw httpError(400, "Google Sheet URL 또는 Spreadsheet ID를 입력해 주세요.");
  }

  const urlMatch = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) {
    return text;
  }

  throw httpError(400, "Google Sheet URL 또는 Spreadsheet ID 형식을 확인해 주세요.");
}

function sheetValuesToCsv(values) {
  if (!Array.isArray(values) || values.length < 2) {
    throw httpError(422, "Google Sheet에는 헤더와 최소 1개 이상의 데이터 행이 필요합니다.");
  }

  const width = Math.max(...values.map((row) => row.length));
  return values
    .map((row) => Array.from({ length: width }, (_, index) => csvEscape(row[index])).join(","))
    .join("\n");
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

function parseSourceUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw httpError(400, "올바른 외부 ERP URL을 입력해 주세요.");
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    throw httpError(400, "http 또는 https URL만 사용할 수 있습니다.");
  }

  return url.toString();
}

function extractCsvFromRemoteBody(body, contentType, sourceUrl) {
  const trimmed = String(body || "").trim();
  if (!trimmed) {
    throw httpError(422, "외부 URL 응답이 비어 있어 ERP 데이터를 만들 수 없습니다.");
  }

  if (contentType.includes("json") || /^[\[{]/.test(trimmed)) {
    return jsonToCsv(trimmed);
  }

  if (contentType.includes("csv") || looksLikeCsv(trimmed)) {
    return trimmed;
  }

  if (contentType.includes("html") || /<html|<table/i.test(trimmed)) {
    const tableCsv = htmlTableToCsv(trimmed);
    if (tableCsv) {
      return tableCsv;
    }

    if (trimmed.includes("self.__next_f.push") || trimmed.includes("_next/static/chunks")) {
      throw httpError(
        422,
        `${sourceUrl}는 Next.js 화면 HTML만 제공하고 서버 응답 안에 ERP 행 데이터가 없습니다. 이 페이지가 브라우저 localStorage 또는 업로드 상태로 데이터를 렌더링하는 구조라면 다른 사이트의 실제 데이터는 보안상 자동으로 읽을 수 없습니다. CSV/JSON 다운로드 URL 또는 공개 API URL을 연결해 주세요.`
      );
    }
  }

  throw httpError(422, "외부 URL에서 CSV, JSON, HTML 테이블 형태의 ERP 데이터를 찾지 못했습니다.");
}

function jsonToCsv(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw httpError(422, "JSON 응답을 해석할 수 없습니다.");
  }

  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.rows)
      ? payload.rows
      : Array.isArray(payload.data)
        ? payload.data
        : null;

  if (!rows?.length || typeof rows[0] !== "object") {
    throw httpError(422, "JSON 응답에서 객체 배열 데이터를 찾지 못했습니다.");
  }

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ].join("\n");
}

function htmlTableToCsv(html) {
  const tableMatch = String(html).match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    return "";
  }

  const rows = [...tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)]
    .map((match) => {
      return [...match[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map((cell) => decodeHtml(cell[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));
    })
    .filter((row) => row.length > 0);

  if (rows.length < 2) {
    return "";
  }

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function looksLikeCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 3);
  return lines.length >= 2 && lines.every((line) => line.includes(","));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function decodeHtml(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");
}

function shouldFallbackToSample(error, body) {
  const text = String(body || "");
  return (
    error?.status === 422 &&
    (text.includes("self.__next_f.push") || text.includes("_next/static/chunks") || /<html/i.test(text))
  );
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
  createErpReport,
  createErpReportFromUrl,
  createErpReportFromGoogleSheet,
  getSampleErpData
};
