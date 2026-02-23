import "dotenv/config";
import http from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import {
  createDirectory,
  deleteEntry,
  ensureWorkspaceRoot,
  getEntryType,
  listFiles,
  readFile,
  renameEntry,
  resolveSafePath,
  writeFile,
} from "./fsService.js";
import { runPython } from "./pythonService.js";
import type { ChatClientMessage, ChatServerMessage } from "./types.js";

const port = Number(process.env.PORT ?? 4000);
const pythonBin = process.env.PYTHON_BIN ?? "python";
const workspaceRoot = path.resolve(process.cwd(), process.env.WORKSPACE_ROOT ?? "../workspace");
const require = createRequire(import.meta.url);

type PtyProcess = {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (listener: (data: string) => void) => void;
  onExit: (listener: (event: { exitCode: number }) => void) => void;
};

type NodePtyModule = {
  spawn: (
    file: string,
    args?: string[],
    options?: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    },
  ) => PtyProcess;
};

const tryLoadNodePty = (): NodePtyModule | null => {
  try {
    return require("node-pty") as NodePtyModule;
  } catch {
    return null;
  }
};

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "editor-backend",
    workspaceRoot,
  });
});

app.get("/api/files", async (_req, res) => {
  try {
    const files = await listFiles(workspaceRoot);
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/files/content", async (req, res) => {
  const targetPath = String(req.query.path ?? "");
  if (!targetPath) {
    res.status(400).json({ error: "Query parameter 'path' is required" });
    return;
  }

  try {
    const content = await readFile(workspaceRoot, targetPath);
    res.json({ path: targetPath, content });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.put("/api/files/content", async (req, res) => {
  const { path: targetPath, content } = req.body as { path?: string; content?: string };
  if (!targetPath || typeof content !== "string") {
    res.status(400).json({ error: "Body must include 'path' and string 'content'" });
    return;
  }

  try {
    await writeFile(workspaceRoot, targetPath, content);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/api/files/folder", async (req, res) => {
  const { path: targetPath } = req.body as { path?: string };
  if (!targetPath) {
    res.status(400).json({ error: "Body must include 'path'" });
    return;
  }

  try {
    await createDirectory(workspaceRoot, targetPath);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.patch("/api/files/rename", async (req, res) => {
  const { oldPath, newPath } = req.body as { oldPath?: string; newPath?: string };
  if (!oldPath || !newPath) {
    res.status(400).json({ error: "Body must include 'oldPath' and 'newPath'" });
    return;
  }

  try {
    await renameEntry(workspaceRoot, oldPath, newPath);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.delete("/api/files", async (req, res) => {
  const targetPath = String(req.query.path ?? "");
  if (!targetPath) {
    res.status(400).json({ error: "Query parameter 'path' is required" });
    return;
  }

  try {
    await deleteEntry(workspaceRoot, targetPath);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.get("/api/files/download", async (req, res) => {
  const targetPath = String(req.query.path ?? "");
  if (!targetPath) {
    res.status(400).json({ error: "Query parameter 'path' is required" });
    return;
  }

  try {
    const entryType = await getEntryType(workspaceRoot, targetPath);
    const safePath = resolveSafePath(workspaceRoot, targetPath);
    const baseName = path.basename(targetPath);
    const safeDownloadName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_") || "download";

    if (entryType === "file") {
      res.download(safePath, safeDownloadName);
      return;
    }

    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${safeDownloadName}.tar.gz"`);

    const tar = spawn("tar", ["-czf", "-", "-C", safePath, "."], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    tar.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    tar.on("error", (error) => {
      if (!res.headersSent) {
        res.status(500).json({ error: `Failed to start tar process: ${error.message}` });
      } else {
        res.end();
      }
    });

    tar.stdout.pipe(res);
    tar.on("close", (code) => {
      if (code !== 0) {
        if (!res.headersSent) {
          res.status(500).json({ error: `Tar command failed: ${stderr || `exit ${code}`}` });
        } else {
          res.end();
        }
      }
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/api/python/run", async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(400).json({ error: "Body must include 'code'" });
    return;
  }

  try {
    const result = await runPython(pythonBin, code);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: "Failed to execute Python",
      details: (error as Error).message,
    });
  }
});

const server = http.createServer(app);

const chatWss = new WebSocketServer({ noServer: true });
const terminalWss = new WebSocketServer({ noServer: true });

chatWss.on("connection", (socket) => {
  socket.on("message", (raw) => {
    let message: ChatClientMessage;
    try {
      message = JSON.parse(String(raw)) as ChatClientMessage;
    } catch {
      const response: ChatServerMessage = {
        type: "error",
        message: "Invalid JSON message",
      };
      socket.send(JSON.stringify(response));
      return;
    }

    if (message.type !== "prompt" || !message.prompt.trim()) {
      const response: ChatServerMessage = {
        type: "error",
        message: "Expected message { type: 'prompt', prompt: string }",
      };
      socket.send(JSON.stringify(response));
      return;
    }

    const generated = [
      "Local AI adapter is wired.",
      "This is a placeholder stream.",
      "Next step: replace with llama.cpp prompt + RAG context.",
      `Prompt length: ${message.prompt.length} chars.`,
    ].join(" ");

    const tokens = generated.split(" ");
    let index = 0;

    const interval = setInterval(() => {
      if (index >= tokens.length) {
        const done: ChatServerMessage = { type: "done" };
        socket.send(JSON.stringify(done));
        clearInterval(interval);
        return;
      }

      const token = tokens[index];
      index += 1;
      const response: ChatServerMessage = { type: "token", token: `${token} ` };
      socket.send(JSON.stringify(response));
    }, 60);

    socket.on("close", () => clearInterval(interval));
  });
});

terminalWss.on("connection", (socket) => {
  const shell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL ?? "/bin/bash";
  const shellArgs = process.platform === "win32" ? [] : ["-i"];

  const sendJson = (payload: unknown) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  };

  const sharedEnv = {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  };

  const nodePty = tryLoadNodePty();
  if (nodePty) {
    const ptyProcess = nodePty.spawn(shell, shellArgs, {
      cwd: workspaceRoot,
      env: sharedEnv,
      cols: 120,
      rows: 30,
      name: "xterm-256color",
    });

    sendJson({ type: "status", message: `Connected to PTY shell: ${shell}` });

    ptyProcess.onData((data) => {
      sendJson({ type: "output", data });
    });

    ptyProcess.onExit(({ exitCode }) => {
      sendJson({ type: "exit", code: exitCode });
      socket.close();
    });

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw)) as
          | { type: "input"; data: string }
          | { type: "resize"; cols: number; rows: number }
          | { type: "kill" };

        if (message.type === "input") {
          ptyProcess.write(message.data);
          return;
        }

        if (message.type === "resize") {
          const cols = Number(message.cols);
          const rows = Number(message.rows);
          if (Number.isFinite(cols) && Number.isFinite(rows) && cols > 1 && rows > 1) {
            ptyProcess.resize(Math.floor(cols), Math.floor(rows));
          }
          return;
        }

        if (message.type === "kill") {
          ptyProcess.kill();
        }
      } catch {
        sendJson({ type: "error", message: "Invalid terminal message" });
      }
    });

    socket.on("close", () => {
      ptyProcess.kill();
    });
    return;
  }

  // Fallback when node-pty is unavailable.
  const child = spawn(shell, shellArgs, {
    cwd: workspaceRoot,
    env: sharedEnv,
    stdio: ["pipe", "pipe", "pipe"],
  });

  sendJson({ type: "status", message: `Connected to basic shell: ${shell} (no PTY)` });

  child.stdout.on("data", (chunk) => {
    sendJson({ type: "output", data: String(chunk) });
  });

  child.stderr.on("data", (chunk) => {
    sendJson({ type: "output", data: String(chunk) });
  });

  child.on("error", (error) => {
    sendJson({ type: "error", message: error.message });
  });

  child.on("close", (code) => {
    sendJson({ type: "exit", code });
    socket.close();
  });

  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(String(raw)) as
        | { type: "input"; data: string }
        | { type: "kill" };

      if (message.type === "input") {
        child.stdin.write(message.data);
        return;
      }

      if (message.type === "kill") {
        child.kill("SIGTERM");
      }
    } catch {
      sendJson({ type: "error", message: "Invalid terminal message" });
    }
  });

  socket.on("close", () => {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // No-op: process already closed.
      }
    }
  });
});

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

  if (pathname === "/ws/chat") {
    chatWss.handleUpgrade(request, socket, head, (ws) => {
      chatWss.emit("connection", ws, request);
    });
    return;
  }

  if (pathname === "/ws/terminal") {
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit("connection", ws, request);
    });
    return;
  }

  socket.destroy();
});

const start = async () => {
  await ensureWorkspaceRoot(workspaceRoot);
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${port}`);
  });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start backend:", error);
  process.exit(1);
});
