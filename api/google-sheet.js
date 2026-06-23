const { createErpReportFromGoogleSheet } = require("../lib/report-service");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "POST 요청만 지원합니다." });
  }

  try {
    const payload = await createErpReportFromGoogleSheet({
      spreadsheet: req.body?.spreadsheet,
      range: req.body?.range,
      analysisGoal: req.body?.analysisGoal,
      companyName: req.body?.companyName
    });

    return res.status(200).json(payload);
  } catch (error) {
    console.error(error);
    return res.status(error.status || 500).json({
      message: error.message || "Google Sheets 데이터를 가져오는 중 오류가 발생했습니다."
    });
  }
};
