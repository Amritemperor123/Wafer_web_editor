function IntelligencePanel({
  activePath,
  isCollapsed,
  onSelectLocation,
  onToggle,
  outlineItems,
  references,
}) {
  return (
    <section className={isCollapsed ? "intel-strip collapsed" : "intel-strip"}>
      <div className="intel-summary">
        <div>
          <h2>Intelligence</h2>
          <p className="panel-subtitle">
            {outlineItems.length} outline items, {references.length} references
          </p>
        </div>
        <button type="button" className="quiet-action" onClick={onToggle}>
          {isCollapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!isCollapsed ? (
        <div className="intel-content">
          <div className="outline-view">
            <div className="intel-title">
              <span>Outline</span>
              <span>{outlineItems.length}</span>
            </div>
            <ul>
              {outlineItems.map((item) => (
                <li key={`${item.kind}-${item.name}-${item.line}`}>
                  <button
                    type="button"
                    onClick={() =>
                      onSelectLocation({
                        path: activePath,
                        line: item.line,
                        col: item.col,
                      })
                    }
                  >
                    <span className="intel-kind">{item.kind}</span>
                    <span>{item.name}</span>
                    <span className="intel-location">L{item.line}</span>
                  </button>
                </li>
              ))}
              {!outlineItems.length ? (
                <li className="empty-state">{activePath ? "No classes or functions found" : "Open a Python file"}</li>
              ) : null}
            </ul>
          </div>

          <div className="references-view">
            <div className="intel-title">
              <span>References</span>
              <span>{references.length}</span>
            </div>
            <ul>
              {references.slice(0, 120).map((reference) => (
                <li key={`${reference.path}-${reference.line}-${reference.col}`}>
                  <button type="button" onClick={() => onSelectLocation(reference)}>
                    <span>{reference.path}</span>
                    <span className="intel-location">
                      {reference.line}:{reference.col}
                    </span>
                    {reference.snippet ? <span className="intel-snippet">{reference.snippet}</span> : null}
                  </button>
                </li>
              ))}
              {!references.length ? <li className="empty-state">Find references to populate this panel</li> : null}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default IntelligencePanel;
