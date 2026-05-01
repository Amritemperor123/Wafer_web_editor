function TabsBar({ activePath, buffers, openTabs, onCloseTab, onSelectTab }) {
  return (
    <div className={openTabs.length ? "tabs-row" : "tabs-row empty-tabs"}>
      {openTabs.length ? (
        openTabs.map((tabPath) => {
          const dirty = buffers[tabPath]?.dirty;

          return (
            <button
              key={tabPath}
              type="button"
              className={tabPath === activePath ? "tab active" : "tab"}
              onClick={() => onSelectTab(tabPath)}
              title={tabPath}
            >
              <span>{tabPath}</span>
              {dirty ? <span className="dirty-dot" title="Unsaved changes" /> : null}
              <span
                role="button"
                tabIndex={0}
                className="tab-close"
                aria-label={`Close ${tabPath}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tabPath);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onCloseTab(tabPath);
                  }
                }}
              >
                x
              </span>
            </button>
          );
        })
      ) : (
        <span className="empty-tabs-message">Open a file from the explorer to start editing</span>
      )}
    </div>
  );
}

export default TabsBar;
