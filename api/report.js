const { createErpReport } = require("../lib/report-service");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "POST 요청만 지원합니다." });
  }

  try {
    const payload = await createErpReport({
      csvText: req.body?.csvText,
      fileName: req.body?.fileName,
      analysisGoal: req.body?.analysisGoal,
      companyName: req.body?.companyName
    });

    return res.status(200).json(payload);
  } catch (error) {
    console.error(error);
    return res.status(error.status || 500).json({
      message: error.message || "ERP 대시보드를 생성하는 중 오류가 발생했습니다."
    });
  }
};
