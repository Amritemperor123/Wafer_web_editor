function AppHeader({ status, dirtyCount }) {
  const hasUnsavedChanges = dirtyCount > 0;

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <div className="brand-mark" aria-hidden="true">
          Py
        </div>
        <div>
          <h1>Python Studio</h1>
          <p>Workspace editor</p>
        </div>
      </div>
      <div className="top-bar-right">
        <span className="status-pill status-message" title={status}>
          <span className="status-dot" aria-hidden="true" />
          {status}
        </span>
        <span className={hasUnsavedChanges ? "status-pill dirty-count active" : "status-pill dirty-count"}>
          {dirtyCount} unsaved
        </span>
      </div>
    </header>
  );
}

export default AppHeader;
