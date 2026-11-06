import http from "node:http";
import { handleChat } from "./lib/gemini.js";

const HOST = "127.0.0.1";
const PORT = 3001;
const MAX_BODY_BYTES = 1024 * 1024;

// 내 PC에서 연 화면만 허용한다. ("null"은 HTML 파일을 더블클릭해서 연 경우)
// 다른 웹사이트가 이 서버로 내 API 키를 쓰지 못하게 하기 위한 제한이다.
function isAllowedOrigin(origin) {
  return (
    origin === "null" ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin ?? "")
  );
}

function setCorsHeaders(req, res) {
  if (isAllowedOrigin(req.headers.origin)) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("요청이 너무 큽니다.");
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);

  const { pathname } = new URL(req.url, `http://${HOST}:${PORT}`);
  if (pathname !== "/api/chat") {
    return sendJson(res, 404, { error: "찾을 수 없는 주소입니다." });
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendJson(res, 405, { error: "POST 요청만 사용할 수 있습니다." });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "요청 형식이 올바르지 않습니다." });
  }

  const result = await handleChat(body);
  return sendJson(res, result.status, result.body);
});

server.listen(PORT, HOST, () => {
  console.log(`서버 실행 중: http://${HOST}:${PORT}/api/chat`);
});
