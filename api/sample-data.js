const { getSampleErpData } = require("../lib/report-service");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "GET 요청만 지원합니다." });
  }

  return res.status(200).json(getSampleErpData());
};
