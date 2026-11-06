import { handleChat } from "../lib/gemini.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 요청만 사용할 수 있습니다." });
  }

  let body;
  try {
    // Vercel은 JSON 형식이 잘못된 요청을 읽을 때 오류를 낸다.
    body = req.body;
  } catch {
    return res.status(400).json({ error: "요청 형식이 올바르지 않습니다." });
  }

  const result = await handleChat(body);
  return res.status(result.status).json(result.body);
}
