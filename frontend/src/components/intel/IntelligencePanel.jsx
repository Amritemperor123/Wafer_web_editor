function IntelligencePanel({ activePath, onSelectLocation, outlineItems, references }) {
  return (
    <section className="intel-strip">
      <div className="outline-view">
        <div className="intel-title">Outline (Classes/Functions)</div>
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
                {item.kind} {item.name} (L{item.line})
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="references-view">
        <div className="intel-title">References</div>
        <ul>
          {references.slice(0, 120).map((reference) => (
            <li key={`${reference.path}-${reference.line}-${reference.col}`}>
              <button type="button" onClick={() => onSelectLocation(reference)}>
                {reference.path}:{reference.line}:{reference.col}
                {reference.snippet ? ` - ${reference.snippet}` : ""}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default IntelligencePanel;
