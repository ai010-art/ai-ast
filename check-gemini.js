import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

// 오류 메시지에 키 값이 섞여 있어도 화면에 나오지 않도록 가린다.
function hideKey(text) {
  return apiKey ? String(text).replaceAll(apiKey, "[키 숨김]") : String(text);
}

if (!apiKey) {
  console.error("실패: .env에서 GEMINI_API_KEY를 찾지 못했습니다.");
  process.exit(1);
}

console.log(`사용 모델: ${model}`);

try {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: '"연결 성공"이라고 한 문장으로만 답해 주세요.',
  });
  console.log(`Gemini 응답: ${response.text}`);
} catch (error) {
  console.error("실패: Gemini 호출 중 오류가 발생했습니다.");
  console.error(`오류 코드: ${error.status ?? "없음"}`);
  console.error(`오류 내용: ${hideKey(error.message)}`);
  process.exit(1);
}
