import { SHORTCUTS_LABEL } from "../../constants/editor";

function EditorStatusBar({ cursorPosition, isDirty }) {
  return (
    <div className="status-strip">
      <span>
        Cursor Ln {cursorPosition.line}, Col {cursorPosition.col}
      </span>
      <span>{isDirty ? "Unsaved changes" : "Saved"}</span>
      <span>{SHORTCUTS_LABEL}</span>
    </div>
  );
}

export default EditorStatusBar;
