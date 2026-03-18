import { useEffect, useRef, useState } from "react";
import "./App.css";
import AppHeader from "./components/layout/AppHeader";
import ExplorerSidebar from "./components/explorer/ExplorerSidebar";
import EditorToolbar from "./components/editor/EditorToolbar";
import TabsBar from "./components/editor/TabsBar";
import PythonEditor from "./components/editor/PythonEditor";
import EditorStatusBar from "./components/editor/EditorStatusBar";
import IntelligencePanel from "./components/intel/IntelligencePanel";
import TerminalPanel from "./components/terminal/TerminalPanel";
import ContextMenu from "./components/menus/ContextMenu";
import { useTerminalSession } from "./hooks/useTerminalSession";
import { useWorkspaceManager } from "./hooks/useWorkspaceManager";

function App() {
  const editorRef = useRef(null);
  const terminalHostRef = useRef(null);
  const terminalRef = useRef(null);

  const [terminalSessionId, setTerminalSessionId] = useState(0);

  const workspace = useWorkspaceManager({ editorRef, terminalRef });

  useTerminalSession({
    sessionId: terminalSessionId,
    terminalHostRef,
    terminalRef,
    setStatus: workspace.setStatus,
  });

  const getCursorLocation = () => {
    const cursor = editorRef.current?.getCursorPosition();
    if (!cursor) {
      return null;
    }

    return {
      line: cursor.row + 1,
      col: cursor.column + 1,
    };
  };

  const handleGoTo = (action) => {
    const cursor = getCursorLocation();
    if (!cursor) {
      return Promise.resolve();
    }

    return workspace.goToDefinition(action, cursor);
  };

  const handleFindReferences = () => {
    const cursor = getCursorLocation();
    if (!cursor) {
      return Promise.resolve();
    }

    return workspace.findReferences(cursor);
  };

  const handleRenameSymbol = () => {
    const cursor = getCursorLocation();
    if (!cursor) {
      return Promise.resolve();
    }

    return workspace.renameSymbolProjectWide(cursor);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        workspace.saveFile();
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        workspace.runCode();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workspace]);

  return (
    <div className="app-shell">
      <AppHeader status={workspace.status} dirtyCount={workspace.dirtyCount} />

      <div
        className={workspace.isSidebarCollapsed ? "layout sidebar-collapsed" : "layout"}
        style={{ "--sidebar-width": `${workspace.sidebarWidth}px` }}
      >
        <ExplorerSidebar
          activePath={workspace.activePath}
          clipboardEntry={workspace.clipboardEntry}
          fileFilter={workspace.fileFilter}
          files={workspace.visibleEntries}
          selectedPath={workspace.selectedPath}
          onCollapse={() => workspace.setIsSidebarCollapsed(true)}
          onContextMenu={(event, entry) => {
            event.preventDefault();
            workspace.setSelectedPath(entry.path);
            workspace.setContextMenu({
              x: event.clientX,
              y: event.clientY,
              entry,
            });
          }}
          onCreateFile={() => workspace.createFile()}
          onCreateFolder={() => workspace.createFolder()}
          onFileFilterChange={workspace.setFileFilter}
          onOpenFile={(path) => workspace.openFile(path).catch((error) => workspace.setStatus(error.message))}
          onRefresh={() => workspace.loadFiles().catch((error) => workspace.setStatus(error.message))}
          onSelectEntry={workspace.setSelectedPath}
        />

        <div
          className="sidebar-resizer"
          onMouseDown={() => {
            if (!workspace.isSidebarCollapsed) {
              workspace.setIsResizingSidebar(true);
            }
          }}
        />

        <main className="panel editor-panel">
          <EditorToolbar
            activePath={workspace.activePath}
            hasDirtyBuffers={workspace.hasDirtyBuffers}
            isSidebarCollapsed={workspace.isSidebarCollapsed}
            onExpandSidebar={() => workspace.setIsSidebarCollapsed(false)}
            onFindReferences={() =>
              handleFindReferences().catch((error) => workspace.setStatus(error.message))
            }
            onGoToDeclaration={() =>
              handleGoTo("declaration").catch((error) => workspace.setStatus(error.message))
            }
            onGoToDefinition={() =>
              handleGoTo("definition").catch((error) => workspace.setStatus(error.message))
            }
            onRenameSymbol={() =>
              handleRenameSymbol().catch((error) => workspace.setStatus(error.message))
            }
            onRunCode={workspace.runCode}
            onSaveAll={workspace.saveAll}
            onSaveFile={workspace.saveFile}
            title={workspace.activePath || "Editor"}
          />

          <TabsBar
            activePath={workspace.activePath}
            buffers={workspace.buffers}
            openTabs={workspace.openTabs}
            onCloseTab={workspace.closeTab}
            onSelectTab={(path) => {
              workspace.setActivePath(path);
              workspace.setSelectedPath(path);
            }}
          />

          <PythonEditor
            activePath={workspace.activePath}
            code={workspace.code}
            editorRef={editorRef}
            onChange={workspace.updateEditorContent}
            onCursorPositionChange={workspace.setCursorPosition}
            onFindReferences={handleFindReferences}
            onGoToDeclaration={() => handleGoTo("declaration")}
            onGoToDefinition={() => handleGoTo("definition")}
            onRenameSymbol={handleRenameSymbol}
            onRequestCompletions={workspace.fetchCompletions}
            onRequestSignatureInfo={workspace.fetchSignatureInfo}
            setStatus={workspace.setStatus}
            signatureInfo={workspace.signatureInfo}
          />

          <EditorStatusBar
            cursorPosition={workspace.cursorPosition}
            isDirty={workspace.activeBuffer.dirty}
          />

          <IntelligencePanel
            activePath={workspace.activePath}
            onSelectLocation={(location) =>
              workspace.goToLocation(location).catch((error) => workspace.setStatus(error.message))
            }
            outlineItems={workspace.outlineItems}
            references={workspace.references}
          />

          <TerminalPanel
            onClear={() => terminalRef.current?.clear()}
            onReconnect={() => setTerminalSessionId((previous) => previous + 1)}
            terminalHostRef={terminalHostRef}
          />
        </main>
      </div>

      <ContextMenu contextMenu={workspace.contextMenu} onAction={workspace.runContextAction} />
    </div>
  );
}

export default App;
