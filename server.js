const path = require("path");
const express = require("express");
const { createErpReport, createErpReportFromUrl, getSampleErpData } = require("./lib/report-service");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/sample-data", (_req, res) => {
  res.json(getSampleErpData());
});

app.post("/api/report", async (req, res) => {
  try {
    const payload = await createErpReport({
      csvText: req.body?.csvText,
      fileName: req.body?.fileName,
      analysisGoal: req.body?.analysisGoal,
      companyName: req.body?.companyName
    });

    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      message: error.message || "ERP 대시보드를 생성하는 중 오류가 발생했습니다."
    });
  }
});

app.post("/api/import-url", async (req, res) => {
  try {
    const payload = await createErpReportFromUrl({
      sourceUrl: req.body?.sourceUrl,
      analysisGoal: req.body?.analysisGoal,
      companyName: req.body?.companyName
    });

    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      message: error.message || "외부 ERP URL 데이터를 가져오는 중 오류가 발생했습니다."
    });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ERP dashboard app running at http://localhost:${PORT}`);
  });
}

module.exports = app;
