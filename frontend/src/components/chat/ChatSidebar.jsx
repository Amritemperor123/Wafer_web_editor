import { useEffect, useMemo, useRef, useState } from "react";

const createAssistantMessage = () => ({
  id: crypto.randomUUID(),
  role: "assistant",
  content: "",
});

const createUserMessage = (content) => ({
  id: crypto.randomUUID(),
  role: "user",
  content,
});

function ChatSidebar({ activePath, isCollapsed, onToggle }) {
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const activeAssistantIdRef = useRef(null);
  const [activeAssistantId, setActiveAssistantId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("Connecting to LM Studio bridge...");
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Ask about the current Python workspace, refactors, bugs, or next steps.",
    },
  ]);

  const canSend = draft.trim().length > 0 && !isStreaming;

  const chatHistory = useMemo(
    () =>
      messages
        .filter((message) => ["user", "assistant"].includes(message.role) && message.content.trim())
        .map(({ role, content }) => ({ role, content })),
    [messages],
  );

  useEffect(() => {
    if (isCollapsed) {
      return undefined;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws/chat`);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnectionStatus("Ready");
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "status") {
          setConnectionStatus(message.message);
          return;
        }

        if (message.type === "token") {
          const assistantId = activeAssistantIdRef.current;
          if (!assistantId) {
            return;
          }

          setMessages((previous) =>
            previous.map((item) =>
              item.id === assistantId ? { ...item, content: item.content + message.token } : item,
            ),
          );
          return;
        }

        if (message.type === "done") {
          activeAssistantIdRef.current = null;
          setActiveAssistantId(null);
          setIsStreaming(false);
          setConnectionStatus("Ready");
          return;
        }

        if (message.type === "error") {
          activeAssistantIdRef.current = null;
          setActiveAssistantId(null);
          setIsStreaming(false);
          setConnectionStatus(message.message);
        }
      } catch {
        setConnectionStatus("Received an invalid chat message");
      }
    });

    socket.addEventListener("close", () => {
      socketRef.current = null;
      activeAssistantIdRef.current = null;
      setActiveAssistantId(null);
      setIsStreaming(false);
      setConnectionStatus("Chat bridge disconnected");
    });

    socket.addEventListener("error", () => {
      setConnectionStatus("Unable to reach chat bridge");
    });

    return () => {
      socket.close();
    };
  }, [isCollapsed]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isCollapsed]);

  const sendPrompt = () => {
    const prompt = draft.trim();
    const socket = socketRef.current;
    if (!prompt || !socket || socket.readyState !== WebSocket.OPEN) {
      setConnectionStatus("Chat bridge is not connected");
      return;
    }

    const userMessage = createUserMessage(prompt);
    const assistantMessage = createAssistantMessage();
    activeAssistantIdRef.current = assistantMessage.id;
    setActiveAssistantId(assistantMessage.id);

    const nextMessages = [...chatHistory, { role: "user", content: prompt }];
    setMessages((previous) => [...previous, userMessage, assistantMessage]);
    setDraft("");
    setIsStreaming(true);
    setConnectionStatus("Sending to LM Studio...");

    socket.send(
      JSON.stringify({
        type: "prompt",
        prompt,
        messages: nextMessages,
      }),
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendPrompt();
  };

  const renderMessageBody = (message) => {
    if (message.content) {
      return <p>{message.content}</p>;
    }

    if (message.id === activeAssistantId && isStreaming) {
      return (
        <div className="chat-loader" aria-label="Assistant is thinking">
          <span />
          <span />
          <span />
        </div>
      );
    }

    return <p>Thinking...</p>;
  };

  return (
    <aside className={isCollapsed ? "chat-panel collapsed" : "chat-panel"}>
      <button
        type="button"
        className="chat-toggle"
        title={isCollapsed ? "Open chat" : "Collapse chat"}
        onClick={onToggle}
      >
        {isCollapsed ? "AI" : ">"}
      </button>

      {!isCollapsed ? (
        <>
          <div className="chat-header">
            <div>
              <h2>Assistant</h2>
              <p className="panel-subtitle">{activePath ? `Context: ${activePath}` : "LM Studio chat"}</p>
            </div>
            <span className={isStreaming ? "chat-live active" : "chat-live"}>Live</span>
          </div>

          <div className="chat-status" title={connectionStatus}>
            <span className="status-dot" aria-hidden="true" />
            <span>{connectionStatus}</span>
          </div>

          <div className="chat-messages">
            {messages.map((message) => (
              <article key={message.id} className={`chat-message ${message.role}`}>
                <span>{message.role === "user" ? "You" : "Assistant"}</span>
                {renderMessageBody(message)}
              </article>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-composer" onSubmit={handleSubmit}>
            <textarea
              value={draft}
              placeholder="Ask LM Studio..."
              rows={3}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.stopPropagation();
                  sendPrompt();
                }
              }}
            />
            <button type="submit" className="primary-action" disabled={!canSend}>
              Send
            </button>
          </form>
        </>
      ) : null}
    </aside>
  );
}

export default ChatSidebar;
