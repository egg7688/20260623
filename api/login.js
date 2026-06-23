module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "POST 요청만 지원합니다." });
  }

  return res.status(410).json({
    message: "현재 앱은 로그인 없이 ERP CSV 업로드 방식으로 동작합니다."
  });
};
