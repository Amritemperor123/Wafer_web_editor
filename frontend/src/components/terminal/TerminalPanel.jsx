function TerminalPanel({ onClear, onReconnect, terminalHostRef }) {
  return (
    <section className="console terminal-panel">
      <div className="panel-title-row">
        <div>
          <h2>Terminal</h2>
          <p className="panel-subtitle">Interactive shell</p>
        </div>
        <div className="terminal-actions">
          <button type="button" className="quiet-action" onClick={onClear}>
            Clear
          </button>
          <button type="button" className="quiet-action" onClick={onReconnect}>
            Reconnect
          </button>
        </div>
      </div>
      <div ref={terminalHostRef} className="terminal-host" />
    </section>
  );
}

export default TerminalPanel;
