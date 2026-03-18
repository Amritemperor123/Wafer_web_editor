import { fileNameFromPath } from "../../utils/path";

function ExplorerSidebar({
  activePath,
  clipboardEntry,
  fileFilter,
  files,
  selectedPath,
  onCollapse,
  onContextMenu,
  onCreateFile,
  onCreateFolder,
  onFileFilterChange,
  onOpenFile,
  onRefresh,
  onSelectEntry,
}) {
  return (
    <aside className="panel files-panel">
      <div className="panel-title-row">
        <h2>Explorer</h2>
        <div className="sidebar-header-actions">
          <button type="button" className="icon-button" title="Refresh" onClick={onRefresh}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.65 6.35A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.76-4.24L13 11h7V4l-2.35 2.35Z" />
            </svg>
          </button>
          <button type="button" className="icon-button" title="New File" onClick={onCreateFile}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm4 18H6V4h7v5h5v11Zm-5-4h-2v-2H9v-2h2v-2h2v2h2v2h-2v2Z" />
            </svg>
          </button>
          <button type="button" className="icon-button" title="New Folder" onClick={onCreateFolder}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 4 12 6h8a2 2 0 0 1 2 2v1H2V6a2 2 0 0 1 2-2h6Zm12 7v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7h20Zm-9 1h-2v2H9v2h2v2h2v-2h2v-2h-2v-2Z" />
            </svg>
          </button>
          <button type="button" className="icon-button" title="Collapse Sidebar" onClick={onCollapse}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15.41 7.41-1.41-1.41L8.59 11.41a2 2 0 0 0 0 2.82L14 19.64l1.41-1.41L10 12.82a1 1 0 0 1 0-1.41l5.41-5.41Z" />
            </svg>
          </button>
        </div>
      </div>

      <input
        className="input"
        placeholder="Filter files and folders..."
        value={fileFilter}
        onChange={(event) => onFileFilterChange(event.target.value)}
      />

      <ul className="file-list">
        {files.map((entry) => {
          const depth = entry.path.split("/").length - 1;
          const name = fileNameFromPath(entry.path);
          const isSelected = selectedPath === entry.path || activePath === entry.path;
          const isCutEntry = clipboardEntry?.mode === "cut" && clipboardEntry.path === entry.path;

          return (
            <li key={entry.path}>
              <div
                className={
                  isSelected
                    ? `entry-row selected${isCutEntry ? " cut-entry" : ""}`
                    : `entry-row${isCutEntry ? " cut-entry" : ""}`
                }
                style={{ paddingLeft: `${8 + depth * 12}px` }}
                onContextMenu={(event) => onContextMenu(event, entry)}
              >
                <button
                  type="button"
                  className="file-button"
                  onClick={() => {
                    onSelectEntry(entry.path);
                    if (entry.type === "file") {
                      onOpenFile(entry.path);
                    }
                  }}
                >
                  <span className="entry-icon">{entry.type === "directory" ? "D" : "F"}</span>
                  <span>{name}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export default ExplorerSidebar;
