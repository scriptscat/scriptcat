import React, { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import { KeyCode, KeyMod } from "monaco-editor";
import { useTranslation } from "react-i18next";
import type { Script } from "@App/app/repo/scripts";
import CodeEditor from "@App/pages/components/CodeEditor";
import type { EditorTab } from "../useEditorTabs";

export interface EditorStatus {
  line: number;
  col: number;
  size: number;
}

export interface CodePaneProps {
  tab: EditorTab;
  getScript: () => Script;
  onChange: (code: string) => void;
  onSave: (script: Script, e: editor.ICodeEditor) => void;
  onSaveAs: (script: Script, e: editor.ICodeEditor) => void;
  onRun: (script: Script, e: editor.ICodeEditor) => void;
  onStatus: (s: EditorStatus) => void;
  onMount: (e: editor.IStandaloneCodeEditor) => void;
}

const byteSize = (code: string) => new TextEncoder().encode(code).length;

function CodePaneImpl(props: CodePaneProps) {
  const { t } = useTranslation();
  const { tab } = props;
  // 用 ref 保存最新回调，避免重复注册 action
  const ref = useRef(props);
  // 在 render 之后同步最新 props，供 reportStatus / handleChange 等回调读取
  useEffect(() => {
    ref.current = props;
  });
  const editorRef = useRef<editor.IStandaloneCodeEditor | undefined>(undefined);

  const reportStatus = (e: editor.IStandaloneCodeEditor) => {
    const pos = e.getPosition();
    ref.current.onStatus({
      line: pos?.lineNumber ?? 1,
      col: pos?.column ?? 1,
      size: byteSize(e.getValue() || ""),
    });
  };

  const handleMount = (e: editor.IStandaloneCodeEditor) => {
    const cur = ref.current;
    editorRef.current = e;
    e.addAction({
      id: "sc-save",
      label: t("editor:save"),
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
      run: (ed) => cur.onSave(cur.getScript(), ed),
    });
    e.addAction({
      id: "sc-save-as",
      label: t("editor:save_as"),
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS],
      run: (ed) => cur.onSaveAs(cur.getScript(), ed),
    });
    e.addAction({
      id: "sc-format",
      label: t("editor:format"),
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF],
      run: (ed) => {
        const selection = ed.getSelection();
        const actionId =
          selection && !selection.isEmpty() ? "editor.action.formatSelection" : "editor.action.formatDocument";
        void ed.getAction(actionId)?.run();
      },
    });
    e.addAction({
      id: "sc-run",
      label: t("editor:run"),
      keybindings: [KeyMod.CtrlCmd | KeyCode.F5],
      run: (ed) => cur.onRun(cur.getScript(), ed),
    });

    e.onDidChangeCursorPosition(() => reportStatus(e));
    reportStatus(e);

    cur.onMount(e);
  };

  const handleChange = (code: string) => {
    ref.current.onChange(code);
    if (editorRef.current) reportStatus(editorRef.current);
  };

  return (
    <CodeEditor
      id={`editor-${tab.uuid}`}
      className="w-full h-full"
      code={tab.code}
      diffCode=""
      editable
      onChange={handleChange}
      onEditorMount={handleMount}
    />
  );
}

// 仅在 uuid 变化时重建，保持各标签 Monaco 实例与撤销历史
export const CodePane = React.memo(CodePaneImpl, (prev, next) => prev.tab.uuid === next.tab.uuid);
CodePane.displayName = "CodePane";
