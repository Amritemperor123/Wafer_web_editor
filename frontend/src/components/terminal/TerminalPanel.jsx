function TerminalPanel({ onClear, onReconnect, terminalHostRef }) {
  return (
    <section className="console terminal-panel">
      <div className="panel-title-row">
        <h2>Terminal</h2>
        <div className="terminal-actions">
          <button type="button" onClick={onClear}>
            Clear
          </button>
          <button type="button" onClick={onReconnect}>
            Reconnect
          </button>
        </div>
      </div>
      <div ref={terminalHostRef} className="terminal-host" />
    </section>
  );
}

export default TerminalPanel;
