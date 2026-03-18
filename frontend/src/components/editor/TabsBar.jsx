function TabsBar({ activePath, buffers, openTabs, onCloseTab, onSelectTab }) {
  return (
    <div className="tabs-row">
      {openTabs.map((tabPath) => {
        const dirty = buffers[tabPath]?.dirty;

        return (
          <button
            key={tabPath}
            type="button"
            className={tabPath === activePath ? "tab active" : "tab"}
            onClick={() => onSelectTab(tabPath)}
          >
            <span>{tabPath}</span>
            {dirty ? <span className="dirty-dot">*</span> : null}
            <span
              role="button"
              tabIndex={0}
              className="tab-close"
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
      })}
    </div>
  );
}

export default TabsBar;
