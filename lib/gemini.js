import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const ANSWER_RULES = `한국어로 간결하게 답한다.

[답변 규칙]
1. 너는 신진엠텍 품질경영실의 AI 비서다.
2. 제공된 문서에 있는 내용만 근거로 답한다.
3. 답변 끝에 근거를 [시방서 5.2], [검사기준서 No.8], [표준서 4], [계약서 제10조] 형식으로 표시한다.
4. 문서에 없으면 추측하지 말고 "제공된 문서에서 확인되지 않습니다"라고 답한다.
5. 사내 기준서(검사기준서, 작업표준서)의 값이 시방서 최신본과 다르면 양쪽 값을 모두 보여주고,
   시방서 값을 기준으로 안내하며 해당 기준서의 개정 검토가 필요하다고 알린다.
   개정 이력으로 설명되는 차이인지, 문서만으로 원인을 알 수 없는 차이인지도 구분한다.
6. 계약서와 시방서가 다르면 계약서 제3조 제2항의 우선순위(특수조건 → 계약서 본문 → 시방서)를 따른다.
7. 단위만 다른 값은 환산식을 보여주고, 불일치가 아니라 "단위만 다름"으로 구분한다.
8. 시방서의 기준이 사내 기준서에 없으면 "누락"이라고 분명히 알린다.
9. 최종 합격·불합격 판정과 기준서 개정은 품질 담당자가 결정한다고 안내한다.`;
const MAX_TEXT_LENGTH = 2000;
const MAX_HISTORY = 20;

// 요청마다 읽으므로 문서를 고쳐도 서버를 다시 켤 필요가 없다.
async function buildSystemInstruction() {
  const knowledgeDir = path.join(process.cwd(), "knowledge");
  const entries = await readdir(knowledgeDir, { recursive: true });
  const fileNames = entries.filter((name) => name.toLowerCase().endsWith(".md")).sort();

  if (fileNames.length === 0) {
    throw new Error("knowledge 폴더에 .md 문서가 없습니다.");
  }

  const documents = await Promise.all(
    fileNames.map(async (name) => {
      const content = await readFile(path.join(knowledgeDir, name), "utf8");
      return `<document name="${name}">\n${content}\n</document>`;
    })
  );

  return `${ANSWER_RULES}\n\n[제공된 문서]\n${documents.join("\n\n")}`;
}

// 입력에 문제가 있으면 안내 문구를, 문제가 없으면 null을 돌려준다.
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "메시지를 입력해 주세요.";
  }

  for (const message of messages) {
    if (message?.role !== "user" && message?.role !== "assistant") {
      return "메시지 형식이 올바르지 않습니다.";
    }
    if (typeof message.text !== "string" || message.text.trim() === "") {
      return "메시지 내용을 입력해 주세요.";
    }
    if (message.text.length > MAX_TEXT_LENGTH) {
      return `메시지는 ${MAX_TEXT_LENGTH.toLocaleString()}자까지 입력할 수 있습니다.`;
    }
  }

  return null;
}

// 최근 메시지만 남기고 Gemini 형식으로 바꾼다. (assistant → model)
export function toGeminiContents(messages) {
  return messages.slice(-MAX_HISTORY).map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.text }],
  }));
}

// 오류 원문은 화면으로 보내지 않고, 쉬운 안내 문구로 바꾼다.
export function toErrorResponse(error) {
  const status = error?.status;

  if (status === 429) {
    return { status: 429, body: { error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." } };
  }
  if (status === 401 || status === 403 || /api.?key/i.test(String(error?.message))) {
    return { status: 500, body: { error: "API 키를 확인하세요." } };
  }
  return { status: 502, body: { error: "답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요." } };
}

// api/chat.js와 local-server.js가 함께 쓰는 처리 함수.
export async function handleChat(body) {
  const messages = body?.messages;
  const invalidReason = validateMessages(messages);
  if (invalidReason) {
    return { status: 400, body: { error: invalidReason } };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { error: "API 키를 확인하세요." } };
  }

  let systemInstruction;
  try {
    systemInstruction = await buildSystemInstruction();
  } catch (error) {
    console.error(`품질 문서 읽기 실패: ${error.code ?? error.message}`);
    return { status: 500, body: { error: "품질 문서를 불러오지 못했습니다. knowledge 폴더를 확인해 주세요." } };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: toGeminiContents(messages),
      config: { systemInstruction },
    });

    if (!response.text) {
      return { status: 502, body: { error: "답변을 가져오지 못했습니다. 다시 시도해 주세요." } };
    }
    return { status: 200, body: { reply: response.text } };
  } catch (error) {
    // 로그에도 오류 원문 대신 상태 코드만 남겨 키가 노출되지 않게 한다.
    console.error(`Gemini 호출 실패 (상태 코드: ${error?.status ?? "없음"})`);
    return toErrorResponse(error);
  }
}
