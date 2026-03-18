import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_FILE_CONTENT,
  EMPTY_BUFFER,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "../constants/editor";
import {
  createFolderEntry,
  deleteFileSystemEntry,
  downloadFileSystemEntry,
  fetchFileContent,
  fetchFiles,
  fetchWorkspaceMeta,
  renameFileSystemEntry,
  requestPythonIntel,
  runPythonCode,
  saveFileContent,
} from "../services/api";
import { fileNameFromPath, isWithinPath, remapPath, toAbsolutePath } from "../utils/path";

export function useWorkspaceManager({ editorRef, terminalRef }) {
  const [files, setFiles] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);
  const [buffers, setBuffers] = useState({});
  const [activePath, setActivePath] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [fileFilter, setFileFilter] = useState("");
  const [status, setStatus] = useState("Loading files...");
  const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 });
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [clipboardEntry, setClipboardEntry] = useState(null);
  const [outlineItems, setOutlineItems] = useState([]);
  const [references, setReferences] = useState([]);
  const [signatureInfo, setSignatureInfo] = useState(null);

  const buffersRef = useRef({});

  useEffect(() => {
    buffersRef.current = buffers;
  }, [buffers]);

  const visibleEntries = useMemo(() => {
    const query = fileFilter.trim().toLowerCase();
    return files.filter((entry) => entry.path.toLowerCase().includes(query));
  }, [files, fileFilter]);

  const activeBuffer = buffers[activePath] ?? EMPTY_BUFFER;
  const code = activeBuffer.content;

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
    const nextFiles = await fetchFiles();
    setFiles(nextFiles);
    setStatus(`Loaded ${nextFiles.length} entries`);
    return nextFiles;
  }, []);

  const loadWorkspaceMeta = useCallback(async () => {
    try {
      const meta = await fetchWorkspaceMeta();
      if (meta) {
        setWorkspaceRoot(String(meta.workspaceRoot ?? ""));
      }
    } catch {
      // Ignore metadata fetch failures; file operations still work.
    }
  }, []);

  const fetchOutline = useCallback(async () => {
    if (!activePath) {
      setOutlineItems([]);
      return;
    }

    try {
      const body = await requestPythonIntel({ action: "outline", path: activePath, code });
      setOutlineItems(Array.isArray(body.outline) ? body.outline : []);
    } catch {
      setOutlineItems([]);
    }
  }, [activePath, code]);

  const fetchSignatureInfo = useCallback(
    async (line, col) => {
      if (!activePath) {
        setSignatureInfo(null);
        return;
      }

      try {
        const body = await requestPythonIntel({
          action: "signature",
          path: activePath,
          code,
          line,
          col,
        });
        setSignatureInfo(body.signature ?? null);
      } catch {
        setSignatureInfo(null);
      }
    },
    [activePath, code],
  );

  const fetchCompletions = useCallback(
    async ({ line, col, prefix, sourceCode }) => {
      if (!activePath) {
        return [];
      }

      const body = await requestPythonIntel({
        action: "complete",
        path: activePath,
        code: sourceCode,
        line,
        col,
        prefix,
      });

      return Array.isArray(body.items) ? body.items : [];
    },
    [activePath],
  );

  const openFile = useCallback(async (nextPath) => {
    const existing = buffersRef.current[nextPath];
    setSelectedPath(nextPath);

    if (existing) {
      setOpenTabs((previous) => (previous.includes(nextPath) ? previous : [...previous, nextPath]));
      setActivePath(nextPath);
      setStatus(`Editing ${nextPath}`);
      return;
    }

    setStatus(`Opening ${nextPath}...`);
    const content = await fetchFileContent(nextPath);

    setBuffers((previous) => ({
      ...previous,
      [nextPath]: {
        content,
        savedContent: content,
        dirty: false,
      },
    }));
    setOpenTabs((previous) => (previous.includes(nextPath) ? previous : [...previous, nextPath]));
    setActivePath(nextPath);
    setStatus(`Editing ${nextPath}`);
  }, []);

  const goToLocation = useCallback(
    async (location) => {
      if (!location?.path) {
        setStatus("No target location found");
        return;
      }

      if (location.path !== activePath) {
        await openFile(location.path);
      }

      requestAnimationFrame(() => {
        const editor = editorRef.current;
        if (!editor) {
          return;
        }

        editor.gotoLine(Number(location.line ?? 1), Math.max(0, Number(location.col ?? 1) - 1), true);
        editor.focus();
      });

      setStatus(`Opened definition at ${location.path}:${location.line}`);
    },
    [activePath, editorRef, openFile],
  );

  const goToDefinition = useCallback(
    async (action, cursor) => {
      if (!activePath || !cursor) {
        return;
      }

      const body = await requestPythonIntel({
        action,
        path: activePath,
        code,
        line: cursor.line,
        col: cursor.col,
      });

      if (!body.location) {
        setStatus(`No ${action} found`);
        return;
      }

      await goToLocation(body.location);
    },
    [activePath, code, goToLocation],
  );

  const findReferences = useCallback(
    async (cursor) => {
      if (!activePath || !cursor) {
        return;
      }

      const body = await requestPythonIntel({
        action: "references",
        path: activePath,
        code,
        line: cursor.line,
        col: cursor.col,
      });

      const nextReferences = Array.isArray(body.references) ? body.references : [];
      setReferences(nextReferences);
      setStatus(
        body.symbol
          ? `Found ${nextReferences.length} reference(s) for '${body.symbol}'`
          : `Found ${nextReferences.length} reference(s)`,
      );
    },
    [activePath, code],
  );

  const saveFile = useCallback(async () => {
    if (!activePath) {
      return;
    }

    setStatus(`Saving ${activePath}...`);

    try {
      await saveFileContent(activePath, code);
    } catch (error) {
      setStatus(error.message);
      return;
    }

    setBuffers((previous) => {
      const current = previous[activePath];
      if (!current) {
        return previous;
      }

      return {
        ...previous,
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

  const saveAll = useCallback(async () => {
    const dirtyPaths = Object.entries(buffers)
      .filter(([, value]) => value.dirty)
      .map(([path]) => path);

    if (!dirtyPaths.length) {
      setStatus("No unsaved files");
      return;
    }

    for (const path of dirtyPaths) {
      try {
        await saveFileContent(path, buffers[path].content);
      } catch (error) {
        setStatus(`Failed to save ${path}: ${error.message}`);
        return;
      }
    }

    setBuffers((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([path, value]) => [
          path,
          { ...value, savedContent: value.content, dirty: false },
        ]),
      ),
    );

    setStatus(`Saved ${dirtyPaths.length} file(s)`);
    await loadFiles();
  }, [buffers, loadFiles]);

  const renameSymbolProjectWide = useCallback(
    async (cursor) => {
      if (!activePath || !cursor) {
        return;
      }

      if (hasDirtyBuffers) {
        const shouldSave = window.confirm(
          "Save all unsaved files before project-wide rename? This operation updates files on disk.",
        );
        if (!shouldSave) {
          return;
        }

        await saveAll();
      }

      const current = await requestPythonIntel({
        action: "definition",
        path: activePath,
        code,
        line: cursor.line,
        col: cursor.col,
      });

      const symbol = current.symbol;
      if (!symbol) {
        setStatus("No symbol under cursor");
        return;
      }

      const newName = window.prompt(`Rename '${symbol}' to`, symbol)?.trim();
      if (!newName || newName === symbol) {
        return;
      }

      const result = await requestPythonIntel({
        action: "rename",
        path: activePath,
        code,
        line: cursor.line,
        col: cursor.col,
        newName,
      });

      const updatedFiles = Array.isArray(result.updatedFiles) ? result.updatedFiles : [];
      if (updatedFiles.length) {
        setBuffers((previous) => {
          const next = { ...previous };
          for (const file of updatedFiles) {
            next[file.path] = {
              content: file.content,
              savedContent: file.content,
              dirty: false,
            };
          }
          return next;
        });
      }

      await loadFiles();
      await fetchOutline();
      setReferences([]);
      setStatus(
        `Renamed '${result.symbol ?? symbol}' to '${result.newName ?? newName}' in ${result.updatedCount ?? 0} file(s)`,
      );
    },
    [activePath, code, fetchOutline, hasDirtyBuffers, loadFiles, saveAll],
  );

  const updateEditorContent = useCallback(
    (nextContent) => {
      if (!activePath) {
        return;
      }

      setBuffers((previous) => {
        const current = previous[activePath] ?? EMPTY_BUFFER;
        return {
          ...previous,
          [activePath]: {
            ...current,
            content: nextContent,
            dirty: nextContent !== current.savedContent,
          },
        };
      });
    },
    [activePath],
  );

  const closeTab = useCallback(
    (pathToClose) => {
      const remaining = openTabs.filter((path) => path !== pathToClose);
      setOpenTabs(remaining);
      if (activePath === pathToClose) {
        setActivePath(remaining[remaining.length - 1] ?? "");
      }
    },
    [activePath, openTabs],
  );

  const createFile = useCallback(
    async (initialPath = "new_file.py") => {
      const candidate = window.prompt("New file path", initialPath)?.trim();
      if (!candidate) {
        return;
      }

      setStatus(`Creating ${candidate}...`);

      try {
        await saveFileContent(candidate, DEFAULT_FILE_CONTENT);
      } catch (error) {
        setStatus(error.message);
        return;
      }

      await loadFiles();
      await openFile(candidate);
      setStatus(`Created ${candidate}`);
    },
    [loadFiles, openFile],
  );

  const createFolder = useCallback(
    async (initialPath = "new_folder") => {
      const candidate = window.prompt("New folder path", initialPath)?.trim();
      if (!candidate) {
        return;
      }

      setStatus(`Creating folder ${candidate}...`);

      try {
        await createFolderEntry(candidate);
      } catch (error) {
        setStatus(error.message);
        return;
      }

      await loadFiles();
      setStatus(`Created folder ${candidate}`);
    },
    [loadFiles],
  );

  const createFileInFolder = useCallback(
    async (folderPath) => {
      const fileName = window.prompt("New file name", "new_file.py")?.trim();
      if (!fileName) {
        return;
      }

      const normalizedName = fileName.replace(/\\/g, "/").replace(/^\/+/, "");
      const candidate = `${folderPath}/${normalizedName}`;

      setStatus(`Creating ${candidate}...`);

      try {
        await saveFileContent(candidate, DEFAULT_FILE_CONTENT);
      } catch (error) {
        setStatus(error.message);
        return;
      }

      await loadFiles();
      await openFile(candidate);
      setStatus(`Created ${candidate}`);
    },
    [loadFiles, openFile],
  );

  const renameEntry = useCallback(
    async (oldPath) => {
      const nextPath = window.prompt("Rename to (full relative path)", oldPath)?.trim();
      if (!nextPath || nextPath === oldPath) {
        return;
      }

      setStatus(`Renaming ${oldPath}...`);

      try {
        await renameFileSystemEntry(oldPath, nextPath);
      } catch (error) {
        setStatus(error.message);
        return;
      }

      setOpenTabs((previous) => previous.map((tab) => remapPath(tab, oldPath, nextPath)));
      setBuffers((previous) => {
        const next = {};
        for (const [key, value] of Object.entries(previous)) {
          next[remapPath(key, oldPath, nextPath)] = value;
        }
        return next;
      });
      setActivePath((previous) => remapPath(previous, oldPath, nextPath));
      setSelectedPath((previous) => remapPath(previous, oldPath, nextPath));

      await loadFiles();
      setStatus(`Renamed to ${nextPath}`);
    },
    [loadFiles],
  );

  const deleteEntry = useCallback(
    async (entryPath, entryType) => {
      const label = entryType === "directory" ? "folder" : "file";
      if (!window.confirm(`Delete ${label} '${entryPath}'? This cannot be undone.`)) {
        return;
      }

      setStatus(`Deleting ${entryPath}...`);

      try {
        await deleteFileSystemEntry(entryPath);
      } catch (error) {
        setStatus(error.message);
        return;
      }

      setOpenTabs((previous) => previous.filter((tab) => !isWithinPath(tab, entryPath)));
      setBuffers((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([path]) => !isWithinPath(path, entryPath)),
        ),
      );
      setActivePath((previous) => (isWithinPath(previous, entryPath) ? "" : previous));
      setSelectedPath((previous) => (isWithinPath(previous, entryPath) ? "" : previous));

      await loadFiles();
      setStatus(`Deleted ${entryPath}`);
    },
    [loadFiles],
  );

  const downloadEntry = useCallback(async (entryPath, entryType) => {
    try {
      setStatus(`Preparing download for ${entryPath}...`);
      const response = await downloadFileSystemEntry(entryPath);
      const blob = await response.blob();
      const fallbackName = `${fileNameFromPath(entryPath)}${entryType === "directory" ? ".tar.gz" : ""}`;
      const contentDisposition = response.headers.get("Content-Disposition") ?? "";
      const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
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
  }, []);

  const writeToClipboard = useCallback(async (text, okLabel) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(okLabel);
    } catch {
      setStatus("Clipboard access denied by browser");
    }
  }, []);

  const runContextAction = useCallback(
    async (action, entry) => {
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
        await writeToClipboard(
          toAbsolutePath(workspaceRoot, entry.path),
          `Copied path: ${entry.path}`,
        );
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
    },
    [
      createFileInFolder,
      deleteEntry,
      downloadEntry,
      renameEntry,
      workspaceRoot,
      writeToClipboard,
    ],
  );

  const runCode = useCallback(async () => {
    if (!activePath) {
      return;
    }

    setStatus(`Running ${activePath}...`);

    try {
      const body = await runPythonCode(code);
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
    } catch (error) {
      const failOutput = `Error: ${error.message ?? "Failed to execute code"}`;
      terminalRef.current?.writeln(`\r\n[run-error] ${failOutput}\r\n`);
      setStatus(failOutput);
    }
  }, [activePath, code, terminalRef]);

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
      const nextWidth = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, event.clientX),
      );
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchOutline().catch(() => undefined);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [activePath, code, fetchOutline]);

  useEffect(() => {
    setReferences([]);
    setSignatureInfo(null);
  }, [activePath]);

  return {
    activeBuffer,
    activePath,
    buffers,
    clipboardEntry,
    code,
    contextMenu,
    createFile,
    createFolder,
    cursorPosition,
    dirtyCount,
    fetchCompletions,
    fetchSignatureInfo,
    fileFilter,
    findReferences,
    goToDefinition,
    goToLocation,
    hasDirtyBuffers,
    isSidebarCollapsed,
    loadFiles,
    openTabs,
    openFile,
    outlineItems,
    references,
    renameSymbolProjectWide,
    runCode,
    runContextAction,
    saveAll,
    saveFile,
    selectedPath,
    setActivePath,
    setContextMenu,
    setCursorPosition,
    setFileFilter,
    setIsResizingSidebar,
    setIsSidebarCollapsed,
    setSelectedPath,
    setStatus,
    sidebarWidth,
    signatureInfo,
    status,
    updateEditorContent,
    visibleEntries,
  };
}
