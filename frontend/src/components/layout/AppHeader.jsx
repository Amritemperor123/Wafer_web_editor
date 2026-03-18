function AppHeader({ status, dirtyCount }) {
  return (
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
  );
}

export default AppHeader;
