function EditorToolbar({
  activePath,
  hasDirtyBuffers,
  isSidebarCollapsed,
  onExpandSidebar,
  onFindReferences,
  onGoToDeclaration,
  onGoToDefinition,
  onRenameSymbol,
  onRunCode,
  onSaveAll,
  onSaveFile,
  title,
}) {
  return (
    <div className="panel-title-row editor-header">
      {isSidebarCollapsed ? (
        <button type="button" className="icon-button" title="Expand Sidebar" onClick={onExpandSidebar}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m8.59 16.59 1.41 1.41L15.41 12.59a2 2 0 0 0 0-2.82L10 4.36 8.59 5.77 14 11.18a1 1 0 0 1 0 1.41l-5.41 5.41Z" />
          </svg>
        </button>
      ) : null}
      <h2>{title}</h2>
      <div className="editor-actions">
        <button type="button" onClick={onSaveFile} disabled={!activePath}>
          Save
        </button>
        <button type="button" onClick={onSaveAll} disabled={!hasDirtyBuffers}>
          Save All
        </button>
        <button type="button" onClick={onGoToDefinition} disabled={!activePath}>
          Go Def
        </button>
        <button type="button" onClick={onGoToDeclaration} disabled={!activePath}>
          Go Decl
        </button>
        <button type="button" onClick={onFindReferences} disabled={!activePath}>
          Refs
        </button>
        <button type="button" onClick={onRenameSymbol} disabled={!activePath}>
          Rename
        </button>
        <button type="button" onClick={onRunCode} disabled={!activePath}>
          Run Python
        </button>
      </div>
    </div>
  );
}

export default EditorToolbar;
