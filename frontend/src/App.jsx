import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./App.css";

const api = {
  files: "/api/files",
  fileContent: "/api/files/content",
  folderCreate: "/api/files/folder",
  runPython: "/api/python/run",
  rename: "/api/files/rename",
  remove: "/api/files",
  download: "/api/files/download",
};

const emptyBuffer = {
  content: "",
  savedContent: "",
  dirty: false,
};

const remapPath = (path, fromPath, toPath) => {
  if (path === fromPath) return toPath;
  if (path.startsWith(`${fromPath}/`)) return `${toPath}${path.slice(fromPath.length)}`;
  return path;
};

const isWithinPath = (candidate, root) => candidate === root || candidate.startsWith(`${root}/`);
const fileNameFromPath = (entryPath) => entryPath.split("/").at(-1) ?? entryPath;

function App() {
  const [files, setFiles] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);
  const [buffers, setBuffers] = useState({});
  const [activePath, setActivePath] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [fileFilter, setFileFilter] = useState("");
  const [status, setStatus] = useState("Loading files...");
  const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 });
  const [terminalSessionId, setTerminalSessionId] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [clipboardEntry, setClipboardEntry] = useState(null);

  const lineNumberRef = useRef(null);
  const buffersRef = useRef({});
  const terminalHostRef = useRef(null);
  const terminalRef = useRef(null);
  const sidebarResizerRef = useRef(null);

  useEffect(() => {
    buffersRef.current = buffers;
  }, [buffers]);

  const visibleEntries = useMemo(() => {
    const query = fileFilter.trim().toLowerCase();
    return files.filter((entry) => entry.path.toLowerCase().includes(query));
  }, [files, fileFilter]);

  const activeBuffer = buffers[activePath] ?? emptyBuffer;
  const code = activeBuffer.content;

  const lineNumbers = useMemo(() => {
    const count = Math.max(code.split("\n").length, 1);
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [code]);

  const hasDirtyBuffers = useMemo(
    () => Object.values(buffers).some((buffer) => buffer.dirty),
    [buffers],
  );

  const dirtyCount = useMemo(
    () => Object.values(buffers).filter((buffer) => buffer.dirty).length,
    [buffers],
  );

  const loadFiles = useCallback(async () => {
    setStatus("Refreshing file list...");
    const response = await fetch(api.files);
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? "Failed to load files");
    }

    const nextFiles = body.files ?? [];
    setFiles(nextFiles);
    setStatus(`Loaded ${nextFiles.length} entries`);
    return nextFiles;
  }, []);

  const loadWorkspaceMeta = useCallback(async () => {
    try {
      const response = await fetch("/api/health");
      const body = await response.json();
      if (response.ok) {
        setWorkspaceRoot(String(body.workspaceRoot ?? ""));
      }
    } catch {
      // Ignore metadata fetch failures; file operations still work.
    }
  }, []);

  const openFile = useCallback(async (nextPath) => {
    const existing = buffersRef.current[nextPath];
    setSelectedPath(nextPath);

    if (existing) {
      setOpenTabs((prev) => (prev.includes(nextPath) ? prev : [...prev, nextPath]));
      setActivePath(nextPath);
      setStatus(`Editing ${nextPath}`);
      return;
    }

    setStatus(`Opening ${nextPath}...`);
    const response = await fetch(`${api.fileContent}?path=${encodeURIComponent(nextPath)}`);
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? "Failed to read file");
    }

    setBuffers((prev) => ({
      ...prev,
      [nextPath]: {
        content: body.content ?? "",
        savedContent: body.content ?? "",
        dirty: false,
      },
    }));
    setOpenTabs((prev) => (prev.includes(nextPath) ? prev : [...prev, nextPath]));
    setActivePath(nextPath);
    setStatus(`Editing ${nextPath}`);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await loadWorkspaceMeta();
        const nextFiles = await loadFiles();
        const onlyFiles = nextFiles.filter((entry) => entry.type === "file");
        const preferred = onlyFiles.find((item) => item.path.endsWith(".py")) ?? onlyFiles[0];
        if (preferred) {
          await openFile(preferred.path);
        }
      } catch (error) {
        setStatus(error.message);
      }
    };
    bootstrap();
  }, [loadFiles, loadWorkspaceMeta, openFile]);

  useEffect(() => {
    const blockDefaultContextMenu = (event) => {
      event.preventDefault();
    };
    document.addEventListener("contextmenu", blockDefaultContextMenu);
    return () => document.removeEventListener("contextmenu", blockDefaultContextMenu);
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const closeMenu = () => setContextMenu(null);
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!isResizingSidebar || isSidebarCollapsed) {
      return undefined;
    }

    const onMouseMove = (event) => {
      const minWidth = 200;
      const maxWidth = 520;
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, event.clientX));
      setSidebarWidth(nextWidth);
    };

    const onMouseUp = () => {
      setIsResizingSidebar(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingSidebar, isSidebarCollapsed]);

  const saveFile = useCallback(async () => {
    if (!activePath) return;

    setStatus(`Saving ${activePath}...`);
    const response = await fetch(api.fileContent, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: activePath, content: code }),
    });
    const body = await response.json();
    if (!response.ok) {
      setStatus(body.error ?? "Save failed");
      return;
    }

    setBuffers((prev) => {
      const current = prev[activePath];
      if (!current) return prev;
      return {
        ...prev,
        [activePath]: {
          ...current,
          savedContent: current.content,
          dirty: false,
        },
      };
    });
    setStatus(`Saved ${activePath}`);
    await loadFiles();
  }, [activePath, code, loadFiles]);

  const saveAll = async () => {
    const dirtyPaths = Object.entries(buffers)
      .filter(([, value]) => value.dirty)
      .map(([path]) => path);

    if (!dirtyPaths.length) {
      setStatus("No unsaved files");
      return;
    }

    for (const path of dirtyPaths) {
      const buffer = buffers[path];
      const response = await fetch(api.fileContent, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: buffer.content }),
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(`Failed to save ${path}: ${body.error ?? "Unknown error"}`);
        return;
      }
    }

    setBuffers((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([path, value]) => [
          path,
          { ...value, savedContent: value.content, dirty: false },
        ]),
      ),
    );
    setStatus(`Saved ${dirtyPaths.length} file(s)`);
    await loadFiles();
  };

  const updateEditorContent = (nextContent) => {
    if (!activePath) return;
    setBuffers((prev) => {
      const current = prev[activePath] ?? emptyBuffer;
      return {
        ...prev,
        [activePath]: {
          ...current,
          content: nextContent,
          dirty: nextContent !== current.savedContent,
        },
      };
    });
  };

  const closeTab = (pathToClose) => {
    const remaining = openTabs.filter((path) => path !== pathToClose);
    setOpenTabs(remaining);
    if (activePath === pathToClose) {
      setActivePath(remaining[remaining.length - 1] ?? "");
    }
  };

  const createFile = async (initialPath = "new_file.py") => {
    const candidate = window.prompt("New file path", initialPath)?.trim();
    if (!candidate) {
      return;
    }

    setStatus(`Creating ${candidate}...`);
    const response = await fetch(api.fileContent, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: candidate, content: "# Start coding\n" }),
    });
    const body = await response.json();
    if (!response.ok) {
      setStatus(body.error ?? "Failed to create file");
      return;
    }

    await loadFiles();
    await openFile(candidate);
    setStatus(`Created ${candidate}`);
  };

  const createFolder = async (initialPath = "new_folder") => {
    const candidate = window.prompt("New folder path", initialPath)?.trim();
    if (!candidate) {
      return;
    }

    setStatus(`Creating folder ${candidate}...`);
    const response = await fetch(api.folderCreate, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: candidate }),
    });
    const body = await response.json();
    if (!response.ok) {
      setStatus(body.error ?? "Failed to create folder");
      return;
    }

    await loadFiles();
    setStatus(`Created folder ${candidate}`);
  };

  const createFileInFolder = async (folderPath) => {
    const fileName = window.prompt("New file name", "new_file.py")?.trim();
    if (!fileName) {
      return;
    }

    const normalizedName = fileName.replace(/\\/g, "/").replace(/^\/+/, "");
    const candidate = `${folderPath}/${normalizedName}`;

    setStatus(`Creating ${candidate}...`);
    const response = await fetch(api.fileContent, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: candidate, content: "# Start coding\n" }),
    });
    const body = await response.json();
    if (!response.ok) {
      setStatus(body.error ?? "Failed to create file");
      return;
    }

    await loadFiles();
    await openFile(candidate);
    setStatus(`Created ${candidate}`);
  };

  const renameEntry = async (oldPath) => {
    const nextPath = window.prompt("Rename to (full relative path)", oldPath)?.trim();
    if (!nextPath || nextPath === oldPath) return;

    setStatus(`Renaming ${oldPath}...`);
    const response = await fetch(api.rename, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPath, newPath: nextPath }),
    });
    const body = await response.json();
    if (!response.ok) {
      setStatus(body.error ?? "Rename failed");
      return;
    }

    setOpenTabs((prev) => prev.map((tab) => remapPath(tab, oldPath, nextPath)));
    setBuffers((prev) => {
      const next = {};
      for (const [key, value] of Object.entries(prev)) {
        next[remapPath(key, oldPath, nextPath)] = value;
      }
      return next;
    });
    setActivePath((prev) => remapPath(prev, oldPath, nextPath));
    setSelectedPath((prev) => remapPath(prev, oldPath, nextPath));

    await loadFiles();
    setStatus(`Renamed to ${nextPath}`);
  };

  const deleteEntry = async (entryPath, entryType) => {
    const label = entryType === "directory" ? "folder" : "file";
    if (!window.confirm(`Delete ${label} '${entryPath}'? This cannot be undone.`)) return;

    setStatus(`Deleting ${entryPath}...`);
    const response = await fetch(`${api.remove}?path=${encodeURIComponent(entryPath)}`, {
      method: "DELETE",
    });
    const body = await response.json();
    if (!response.ok) {
      setStatus(body.error ?? "Delete failed");
      return;
    }

    setOpenTabs((prev) => prev.filter((tab) => !isWithinPath(tab, entryPath)));
    setBuffers((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([path]) => !isWithinPath(path, entryPath))),
    );
    setActivePath((prev) => (isWithinPath(prev, entryPath) ? "" : prev));
    setSelectedPath((prev) => (isWithinPath(prev, entryPath) ? "" : prev));

    await loadFiles();
    setStatus(`Deleted ${entryPath}`);
  };

  const downloadEntry = async (entryPath, entryType) => {
    try {
      setStatus(`Preparing download for ${entryPath}...`);
      const response = await fetch(`${api.download}?path=${encodeURIComponent(entryPath)}`);
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? "Download failed");
      }

      const blob = await response.blob();
      const fallbackName = `${fileNameFromPath(entryPath)}${entryType === "directory" ? ".tar.gz" : ""}`;
      const contentDisposition = response.headers.get("Content-Disposition") ?? "";
      const match = contentDisposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] ?? fallbackName;

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setStatus(`Downloaded ${entryPath}`);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const toAbsolutePath = (relativePath) => {
    if (!workspaceRoot) {
      return relativePath;
    }

    const trailingSlashTrimmed = workspaceRoot.replace(/[\\/]+$/, "");
    const separator = trailingSlashTrimmed.includes("\\") ? "\\" : "/";
    const normalizedRel = relativePath.replace(/\//g, separator);
    return `${trailingSlashTrimmed}${separator}${normalizedRel}`;
  };

  const writeToClipboard = async (text, okLabel) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(okLabel);
    } catch {
      setStatus("Clipboard access denied by browser");
    }
  };

  const runContextAction = async (action, entry) => {
    if (!entry) {
      return;
    }

    setContextMenu(null);
    if (action === "cut") {
      setClipboardEntry({ mode: "cut", ...entry });
      setStatus(`Cut: ${entry.path}`);
      return;
    }
    if (action === "copy") {
      setClipboardEntry({ mode: "copy", ...entry });
      setStatus(`Copied: ${entry.path}`);
      return;
    }
    if (action === "copy-path") {
      await writeToClipboard(toAbsolutePath(entry.path), `Copied path: ${entry.path}`);
      return;
    }
    if (action === "copy-relative-path") {
      await writeToClipboard(entry.path, `Copied relative path: ${entry.path}`);
      return;
    }
    if (action === "rename") {
      await renameEntry(entry.path);
      return;
    }
    if (action === "delete") {
      await deleteEntry(entry.path, entry.type);
      return;
    }
    if (action === "new-file-in-folder" && entry.type === "directory") {
      await createFileInFolder(entry.path);
      return;
    }
    if (action === "download") {
      await downloadEntry(entry.path, entry.type);
    }
  };

  const runCode = useCallback(async () => {
    if (!activePath) return;

    setStatus(`Running ${activePath}...`);
    const response = await fetch(api.runPython, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = await response.json();
    if (!response.ok) {
      const failOutput = `Error: ${body.error ?? "Failed to execute code"}`;
      terminalRef.current?.writeln(`\r\n[run-error] ${failOutput}\r\n`);
      setStatus(failOutput);
      return;
    }

    const output = [
      body.stdout ? `STDOUT:\n${body.stdout}` : "",
      body.stderr ? `STDERR:\n${body.stderr}` : "",
      `Exit Code: ${body.exitCode}`,
      body.timedOut ? "Timed out: true" : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    terminalRef.current?.writeln(`\r\n[run] ${activePath}\r\n${output || "No output"}\r\n`);
    setStatus(`Finished ${activePath}`);
  }, [activePath, code]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveFile();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        runCode();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runCode, saveFile]);

  useEffect(() => {
    if (!terminalHostRef.current) return;

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
  }, [terminalSessionId]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-left">
          <h1>Python IDE</h1>
          <p>Browser-based workspace</p>
        </div>
        <div className="top-bar-right">
          <span className="status-pill">{status}</span>
          <span className="status-pill">{dirtyCount} unsaved</span>
        </div>
      </header>

      <div
        className={isSidebarCollapsed ? "layout sidebar-collapsed" : "layout"}
        style={{ "--sidebar-width": `${sidebarWidth}px` }}
      >
        <aside className="panel files-panel">
          <div className="panel-title-row">
            <h2>Explorer</h2>
            <div className="sidebar-header-actions">
              <button
                type="button"
                className="icon-button"
                title="Refresh"
                onClick={() => loadFiles().catch((error) => setStatus(error.message))}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17.65 6.35A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.76-4.24L13 11h7V4l-2.35 2.35Z" />
                </svg>
              </button>
              <button
                type="button"
                className="icon-button"
                title="New File"
                onClick={() => createFile()}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm4 18H6V4h7v5h5v11Zm-5-4h-2v-2H9v-2h2v-2h2v2h2v2h-2v2Z" />
                </svg>
              </button>
              <button
                type="button"
                className="icon-button"
                title="New Folder"
                onClick={() => createFolder()}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10 4 12 6h8a2 2 0 0 1 2 2v1H2V6a2 2 0 0 1 2-2h6Zm12 7v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7h20Zm-9 1h-2v2H9v2h2v2h2v-2h2v-2h-2v-2Z" />
                </svg>
              </button>
              <button
                type="button"
                className="icon-button"
                title="Collapse Sidebar"
                onClick={() => setIsSidebarCollapsed(true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m15.41 7.41-1.41-1.41L8.59 11.41a2 2 0 0 0 0 2.82L14 19.64l1.41-1.41L10 12.82a1 1 0 0 1 0-1.41l5.41-5.41Z" />
                </svg>
              </button>
            </div>
          </div>
          <input
            value={fileFilter}
            onChange={(event) => setFileFilter(event.target.value)}
            className="input"
            placeholder="Filter files and folders..."
          />

          <ul className="file-list">
            {visibleEntries.map((entry) => {
              const depth = entry.path.split("/").length - 1;
              const name = fileNameFromPath(entry.path);
              const isSelected = selectedPath === entry.path || activePath === entry.path;
              const isCutEntry = clipboardEntry?.mode === "cut" && clipboardEntry.path === entry.path;

              return (
                <li key={entry.path}>
                  <div
                    className={
                      isSelected
                        ? `entry-row selected${isCutEntry ? " cut-entry" : ""}`
                        : `entry-row${isCutEntry ? " cut-entry" : ""}`
                    }
                    style={{ paddingLeft: `${8 + depth * 12}px` }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setSelectedPath(entry.path);
                      setContextMenu({
                        x: event.clientX,
                        y: event.clientY,
                        entry,
                      });
                    }}
                  >
                    <button
                      type="button"
                      className="file-button"
                      onClick={() => {
                        setSelectedPath(entry.path);
                        if (entry.type === "file") {
                          openFile(entry.path).catch((error) => setStatus(error.message));
                        }
                      }}
                    >
                      <span className="entry-icon">{entry.type === "directory" ? "D" : "F"}</span>
                      <span>{name}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
        <div
          ref={sidebarResizerRef}
          className="sidebar-resizer"
          onMouseDown={() => {
            if (!isSidebarCollapsed) {
              setIsResizingSidebar(true);
            }
          }}
        />

        <main className="panel editor-panel">
          <div className="panel-title-row editor-header">
            {isSidebarCollapsed ? (
              <button
                type="button"
                className="icon-button"
                title="Expand Sidebar"
                onClick={() => setIsSidebarCollapsed(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m8.59 16.59 1.41 1.41L15.41 12.59a2 2 0 0 0 0-2.82L10 4.36 8.59 5.77 14 11.18a1 1 0 0 1 0 1.41l-5.41 5.41Z" />
                </svg>
              </button>
            ) : null}
            <h2>{activePath || "Editor"}</h2>
            <div className="editor-actions">
              <button type="button" onClick={saveFile} disabled={!activePath}>
                Save
              </button>
              <button type="button" onClick={saveAll} disabled={!hasDirtyBuffers}>
                Save All
              </button>
              <button type="button" onClick={runCode} disabled={!activePath}>
                Run Python
              </button>
            </div>
          </div>
          <div className="tabs-row">
            {openTabs.map((tabPath) => {
              const dirty = buffers[tabPath]?.dirty;
              return (
                <button
                  key={tabPath}
                  type="button"
                  className={tabPath === activePath ? "tab active" : "tab"}
                  onClick={() => {
                    setActivePath(tabPath);
                    setSelectedPath(tabPath);
                  }}
                >
                  <span>{tabPath}</span>
                  {dirty ? <span className="dirty-dot">*</span> : null}
                  <span
                    role="button"
                    tabIndex={0}
                    className="tab-close"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tabPath);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        closeTab(tabPath);
                      }
                    }}
                  >
                    x
                  </span>
                </button>
              );
            })}
          </div>
          <div className="editor-wrap">
            <pre ref={lineNumberRef} className="line-numbers">
              {lineNumbers.join("\n")}
            </pre>
            <textarea
              value={code}
              onChange={(event) => updateEditorContent(event.target.value)}
              onClick={(event) => {
                const value = event.currentTarget.value.slice(0, event.currentTarget.selectionStart);
                const lines = value.split("\n");
                setCursorPosition({ line: lines.length, col: lines[lines.length - 1].length + 1 });
              }}
              onKeyUp={(event) => {
                const value = event.currentTarget.value.slice(0, event.currentTarget.selectionStart);
                const lines = value.split("\n");
                setCursorPosition({ line: lines.length, col: lines[lines.length - 1].length + 1 });
              }}
              onScroll={(event) => {
                if (lineNumberRef.current) {
                  lineNumberRef.current.scrollTop = event.currentTarget.scrollTop;
                }
              }}
              className="code-editor"
              spellCheck={false}
              placeholder="Select or create a Python file to begin"
            />
          </div>
          <div className="status-strip">
            <span>
              Cursor Ln {cursorPosition.line}, Col {cursorPosition.col}
            </span>
            <span>{activeBuffer.dirty ? "Unsaved changes" : "Saved"}</span>
            <span>Shortcuts: Ctrl/Cmd+S save, Ctrl/Cmd+Enter run</span>
          </div>
          <section className="console terminal-panel">
            <div className="panel-title-row">
              <h2>Terminal</h2>
              <div className="terminal-actions">
                <button type="button" onClick={() => terminalRef.current?.clear()}>
                  Clear
                </button>
                <button type="button" onClick={() => setTerminalSessionId((prev) => prev + 1)}>
                  Reconnect
                </button>
              </div>
            </div>
            <div ref={terminalHostRef} className="terminal-host" />
          </section>
        </main>
      </div>
      {contextMenu ? (
        <div
          className="context-menu"
          style={{
            left: `${Math.max(8, Math.min(contextMenu.x, window.innerWidth - 220))}px`,
            top: `${Math.max(8, Math.min(contextMenu.y, window.innerHeight - 320))}px`,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => runContextAction("cut", contextMenu.entry)}>
            Cut
          </button>
          <button type="button" onClick={() => runContextAction("copy", contextMenu.entry)}>
            Copy
          </button>
          <button type="button" onClick={() => runContextAction("copy-path", contextMenu.entry)}>
            Copy Path
          </button>
          <button
            type="button"
            onClick={() => runContextAction("copy-relative-path", contextMenu.entry)}
          >
            Copy Relative Path
          </button>
          {contextMenu.entry.type === "directory" ? (
            <button
              type="button"
              onClick={() => runContextAction("new-file-in-folder", contextMenu.entry)}
            >
              New File
            </button>
          ) : null}
          <button type="button" onClick={() => runContextAction("rename", contextMenu.entry)}>
            Rename
          </button>
          <button type="button" onClick={() => runContextAction("download", contextMenu.entry)}>
            Download
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => runContextAction("delete", contextMenu.entry)}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default App;
