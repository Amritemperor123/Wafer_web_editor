import { useEffect } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export function useTerminalSession({ sessionId, terminalHostRef, terminalRef, setStatus }) {
  useEffect(() => {
    if (!terminalHostRef.current) {
      return undefined;
    }

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: "#181818",
        foreground: "#d4d4d4",
      },
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      scrollback: 2000,
      convertEol: true,
    });
    const fitAddon = new FitAddon();

    term.loadAddon(fitAddon);
    term.open(terminalHostRef.current);
    fitAddon.fit();

    terminalRef.current = term;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws/terminal`);

    ws.addEventListener("open", () => {
      term.writeln("Connected to web terminal.\r");
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      setStatus("Terminal connected");
    });

    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "output") {
          term.write(message.data);
          return;
        }
        if (message.type === "status") {
          term.writeln(`\r\n${message.message}\r`);
          return;
        }
        if (message.type === "error") {
          term.writeln(`\r\n[terminal-error] ${message.message}\r`);
          return;
        }
        if (message.type === "exit") {
          term.writeln(`\r\n[terminal exited: ${message.code}]\r\n`);
          setStatus("Terminal disconnected");
        }
      } catch {
        term.write(String(event.data));
      }
    });

    ws.addEventListener("close", () => {
      setStatus("Terminal closed");
    });

    ws.addEventListener("error", () => {
      term.writeln("\r\n[terminal-error] Unable to connect terminal session\r\n");
      setStatus("Terminal error");
    });

    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };

    const terminalResizeDisposable = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      sendResize();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      terminalResizeDisposable.dispose();
      dataDisposable.dispose();
      ws.close();
      term.dispose();
      terminalRef.current = null;
    };
  }, [sessionId, setStatus, terminalHostRef, terminalRef]);
}
