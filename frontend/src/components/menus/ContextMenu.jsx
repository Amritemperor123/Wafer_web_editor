function ContextMenu({ contextMenu, onAction }) {
  if (!contextMenu) {
    return null;
  }

  return (
    <div
      className="context-menu"
      style={{
        left: `${Math.max(8, Math.min(contextMenu.x, window.innerWidth - 220))}px`,
        top: `${Math.max(8, Math.min(contextMenu.y, window.innerHeight - 320))}px`,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={() => onAction("cut", contextMenu.entry)}>
        Cut
      </button>
      <button type="button" onClick={() => onAction("copy", contextMenu.entry)}>
        Copy
      </button>
      <button type="button" onClick={() => onAction("copy-path", contextMenu.entry)}>
        Copy Path
      </button>
      <button type="button" onClick={() => onAction("copy-relative-path", contextMenu.entry)}>
        Copy Relative Path
      </button>
      {contextMenu.entry.type === "directory" ? (
        <button type="button" onClick={() => onAction("new-file-in-folder", contextMenu.entry)}>
          New File
        </button>
      ) : null}
      <button type="button" onClick={() => onAction("rename", contextMenu.entry)}>
        Rename
      </button>
      <button type="button" onClick={() => onAction("download", contextMenu.entry)}>
        Download
      </button>
      <button type="button" className="danger" onClick={() => onAction("delete", contextMenu.entry)}>
        Delete
      </button>
    </div>
  );
}

export default ContextMenu;
