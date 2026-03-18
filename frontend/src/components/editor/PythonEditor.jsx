import { useCallback, useEffect, useRef } from "react";
import AceEditor from "react-ace";
import ace from "ace-builds/src-noconflict/ace";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/theme-monokai";
import "ace-builds/src-noconflict/ext-language_tools";
import { ACE_EDITOR_OPTIONS } from "../../constants/editor";

function PythonEditor({
  activePath,
  code,
  editorRef,
  onChange,
  onCursorPositionChange,
  onFindReferences,
  onGoToDeclaration,
  onGoToDefinition,
  onRenameSymbol,
  onRequestCompletions,
  onRequestSignatureInfo,
  setStatus,
  signatureInfo,
}) {
  const completerRegisteredRef = useRef(false);
  const signatureTimerRef = useRef(null);

  const handleEditorLoad = useCallback(
    (editor) => {
      editorRef.current = editor;

      if (!completerRegisteredRef.current) {
        const langTools = ace.require("ace/ext/language_tools");
        const completer = {
          getCompletions: async (_aceEditor, _session, pos, prefix, callback) => {
            if (!activePath) {
              callback(null, []);
              return;
            }

            try {
              const items = await onRequestCompletions({
                line: pos.row + 1,
                col: pos.column + 1,
                prefix,
                sourceCode: editor.getValue(),
              });

              callback(
                null,
                items.map((item) => ({
                  caption: item.name,
                  value: item.name,
                  meta: item.kind ?? "symbol",
                  score: 1000,
                  docHTML: item.doc
                    ? `<b>${item.detail || item.name}</b><hr/><pre>${item.doc}</pre>`
                    : `<b>${item.detail || item.name}</b>`,
                })),
              );
            } catch {
              callback(null, []);
            }
          },
        };

        langTools.addCompleter(completer);
        completerRegisteredRef.current = true;
      }

      editor.commands.addCommand({
        name: "gotoDefinition",
        bindKey: { win: "F12", mac: "F12" },
        exec: () => onGoToDefinition().catch((error) => setStatus(error.message)),
      });
      editor.commands.addCommand({
        name: "gotoDeclaration",
        bindKey: { win: "Alt-F12", mac: "Alt-F12" },
        exec: () => onGoToDeclaration().catch((error) => setStatus(error.message)),
      });
      editor.commands.addCommand({
        name: "findReferences",
        bindKey: { win: "Shift-F12", mac: "Shift-F12" },
        exec: () => onFindReferences().catch((error) => setStatus(error.message)),
      });
      editor.commands.addCommand({
        name: "renameSymbolProjectWide",
        bindKey: { win: "Ctrl-Shift-R", mac: "Command-Shift-R" },
        exec: () => onRenameSymbol().catch((error) => setStatus(error.message)),
      });
    },
    [
      activePath,
      editorRef,
      onFindReferences,
      onGoToDeclaration,
      onGoToDefinition,
      onRenameSymbol,
      onRequestCompletions,
      setStatus,
    ],
  );

  useEffect(() => {
    return () => {
      if (signatureTimerRef.current) {
        window.clearTimeout(signatureTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="editor-wrap">
      {signatureInfo ? (
        <div className="signature-tooltip">
          <strong>{signatureInfo.label}</strong>
          <span>Parameter #{(signatureInfo.activeParam ?? 0) + 1}</span>
          {signatureInfo.doc ? <p>{signatureInfo.doc}</p> : null}
        </div>
      ) : null}

      <AceEditor
        mode="python"
        theme="monokai"
        name="python-editor"
        width="100%"
        height="100%"
        value={code}
        onChange={onChange}
        onLoad={handleEditorLoad}
        onCursorChange={(selection) => {
          const line = selection.cursor.row + 1;
          const col = selection.cursor.column + 1;
          onCursorPositionChange({ line, col });

          if (signatureTimerRef.current) {
            window.clearTimeout(signatureTimerRef.current);
          }

          signatureTimerRef.current = window.setTimeout(() => {
            onRequestSignatureInfo(line, col).catch(() => undefined);
          }, 180);
        }}
        className="code-editor-ace"
        editorProps={{ $blockScrolling: true }}
        setOptions={ACE_EDITOR_OPTIONS}
        placeholder="Select or create a Python file to begin"
      />
    </div>
  );
}

export default PythonEditor;
