const { useEffect, useRef, useState } = React;

const isLocal = ["127.0.0.1", "localhost"].includes(window.location.hostname);
const API_URL = isLocal ? "http://127.0.0.1:3001/api/chat" : "/api/chat";

const MAX_LENGTH = 2000;
const CONNECTION_ERROR = "서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인해 주세요.";
const UNKNOWN_ERROR = "답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.";

// 채팅창 크기 제한(px). 화면 여백은 style.css의 팝업 위치와 맞춘 값이다.
const MIN_WIDTH = 320;
const MIN_HEIGHT = 400;
const SIDE_MARGIN = 48;
const VERTICAL_MARGIN = 120;
const KEYBOARD_STEP = 20;

function clampSize(width, height) {
  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - SIDE_MARGIN);
  const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - VERTICAL_MARGIN);
  return {
    width: Math.round(Math.min(maxWidth, Math.max(MIN_WIDTH, width))),
    height: Math.round(Math.min(maxHeight, Math.max(MIN_HEIGHT, height))),
  };
}

async function requestReply(messages) {
  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
  } catch {
    throw new Error(CONNECTION_ERROR);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.reply) {
    throw new Error(data.error || UNKNOWN_ERROR);
  }
  return data.reply;
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.3 4.6 6.7L5.5 21.5l4.4-2.7c.7.1 1.4.2 2.1.2 5.5 0 10-3.6 10-8s-4.5-8-10-8z"
      />
      <circle cx="8" cy="11" r="1.3" fill="#fee500" />
      <circle cx="12" cy="11" r="1.3" fill="#fee500" />
      <circle cx="16" cy="11" r="1.3" fill="#fee500" />
    </svg>
  );
}

function CloseIcon({ size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        d="M6 6l12 12M18 6L6 18"
      />
    </svg>
  );
}

function currentTime() {
  return new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

function MessageRow({ role, text, time }) {
  const isMine = role === "user";

  return (
    <div className={`row ${isMine ? "mine" : "theirs"}`}>
      {!isMine && <div className="avatar" aria-hidden="true">AI</div>}
      <div className="row-body">
        {!isMine && <div className="sender">AI 비서</div>}
        <div className="bubble-line">
          <div className={`bubble ${role}${time ? "" : " pending"}`}>{text}</div>
          {time && <span className="time">{time}</span>}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [popupSize, setPopupSize] = useState(null);
  const popup = useRef(null);
  const nextId = useRef(1);
  const chatEnd = useRef(null);
  const inputBox = useRef(null);
  const launcher = useRef(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading, isOpen]);

  // 열면 입력창으로, 닫으면 아이콘으로 키보드 위치를 옮긴다.
  useEffect(() => {
    if (isOpen) {
      inputBox.current?.focus();
    } else if (wasOpen.current) {
      launcher.current?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  function createMessage(role, text) {
    return { id: nextId.current++, role, text, time: currentTime() };
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage = createMessage("user", text);
    const updated = [...messages, userMessage];
    setMessages(updated);
    setInput("");
    setIsLoading(true);
    inputBox.current?.focus();

    // 화면에 표시한 오류 문구는 대화 기록이 아니므로 서버로 보내지 않는다.
    const history = updated
      .filter((message) => message.role !== "error")
      .map(({ role, text }) => ({ role, text }));

    try {
      const reply = await requestReply(history);
      setMessages((current) => [...current, createMessage("assistant", reply)]);
    } catch (error) {
      setMessages((current) => [...current, createMessage("error", error.message)]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(event) {
    // 한글 조합 중의 Enter는 전송하지 않는다. (마지막 글자 중복 전송 방지)
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  function clearChat() {
    setMessages([]);
    inputBox.current?.focus();
  }

  function handlePopupKeyDown(event) {
    if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  // 채팅창은 오른쪽 아래에 고정되어 있어, 왼쪽·위쪽 가장자리를 끌어 크기를 바꾼다.
  function startResize(event, { horizontal, vertical }) {
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = popup.current.getBoundingClientRect();

    function handleMove(moveEvent) {
      setPopupSize(
        clampSize(
          start.width + (horizontal ? startX - moveEvent.clientX : 0),
          start.height + (vertical ? startY - moveEvent.clientY : 0)
        )
      );
    }

    function stopResize() {
      handle.removeEventListener("pointermove", handleMove);
      handle.removeEventListener("pointerup", stopResize);
      handle.removeEventListener("pointercancel", stopResize);
      document.body.classList.remove("resizing");
    }

    handle.setPointerCapture(event.pointerId);
    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", stopResize);
    handle.addEventListener("pointercancel", stopResize);
    document.body.classList.add("resizing");
  }

  function handleResizeKeyDown(event) {
    const change = {
      ArrowLeft: [KEYBOARD_STEP, 0],
      ArrowRight: [-KEYBOARD_STEP, 0],
      ArrowUp: [0, KEYBOARD_STEP],
      ArrowDown: [0, -KEYBOARD_STEP],
    }[event.key];
    if (!change) return;

    event.preventDefault();
    const { width, height } = popup.current.getBoundingClientRect();
    setPopupSize(clampSize(width + change[0], height + change[1]));
  }

  return (
    <>
      {isOpen && (
        <div
          ref={popup}
          className="app"
          role="dialog"
          aria-label="품질경영실 AI 비서"
          onKeyDown={handlePopupKeyDown}
          style={
            popupSize
              ? { "--popup-width": `${popupSize.width}px`, "--popup-height": `${popupSize.height}px` }
              : undefined
          }
        >
          <div
            className="resize-edge resize-top"
            aria-hidden="true"
            onPointerDown={(event) => startResize(event, { vertical: true })}
          />
          <div
            className="resize-edge resize-left"
            aria-hidden="true"
            onPointerDown={(event) => startResize(event, { horizontal: true })}
          />
          <button
            type="button"
            className="resize-corner"
            aria-label="채팅창 크기 조절. 화살표 키로 조절할 수 있습니다."
            title="끌어서 크기 조절"
            onPointerDown={(event) => startResize(event, { horizontal: true, vertical: true })}
            onKeyDown={handleResizeKeyDown}
          />

          <header className="header">
            <h1>품질경영실 AI 비서</h1>
            <div className="header-actions">
              <button
                type="button"
                className="clear-button"
                onClick={clearChat}
                disabled={isLoading || messages.length === 0}
              >
                대화 지우기
              </button>
              <button
                type="button"
                className="close-button"
                onClick={() => setIsOpen(false)}
                aria-label="채팅창 닫기"
              >
                <CloseIcon size={20} />
              </button>
            </div>
          </header>

          <main className="chat" aria-live="polite">
            {messages.length === 0 && !isLoading && (
              <p className="empty">궁금한 내용을 입력해 보세요.</p>
            )}

            {messages.map((message) => (
              <MessageRow key={message.id} role={message.role} text={message.text} time={message.time} />
            ))}

            {isLoading && <MessageRow role="assistant" text="답변 작성 중..." />}
            <div ref={chatEnd} />
          </main>

          <footer className="composer">
            <form className="composer-row" onSubmit={handleSubmit}>
              <textarea
                ref={inputBox}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="메시지를 입력하세요"
                aria-label="메시지 입력"
                maxLength={MAX_LENGTH}
                rows={2}
              />
              <button type="submit" className="send-button" disabled={isLoading || !input.trim()}>
                보내기
              </button>
            </form>
            <p className="notice">실습용 챗봇입니다. 실제 회사 자료나 개인정보를 입력하지 마세요.</p>
          </footer>
        </div>
      )}

      <button
        type="button"
        ref={launcher}
        className={`launcher${isOpen ? " open" : ""}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? "채팅창 닫기" : "채팅창 열기"}
        aria-expanded={isOpen}
      >
        {isOpen ? <CloseIcon size={26} /> : <ChatIcon />}
      </button>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
