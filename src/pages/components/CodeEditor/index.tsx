import { editor } from "monaco-editor";
import React, { useEffect, useImperativeHandle, useState } from "react";

type Props = {
  // eslint-disable-next-line react/require-default-props
  className?: string;
  // eslint-disable-next-line react/require-default-props
  diffCode?: string; // 因为代码加载是异步的,diifCode有3种状态:undefined不确定,""没有diff,有diff,不确定的情况下,编辑器不会加载
  // eslint-disable-next-line react/require-default-props
  editable?: boolean;
  id: string;
  code: string;
};

const CodeEditor: React.ForwardRefRenderFunction<
  { editor: editor.ICodeEditor | undefined },
  Props
> = ({ id, className, code, diffCode, editable }, ref) => {
  const [monacoEditor, setEditor] = useState<any>();
  useImperativeHandle(ref, () => ({
    editor: monacoEditor,
  }));
  useEffect(() => {
    if (diffCode === undefined) {
      return () => {};
    }
    let edit: editor.IStandaloneDiffEditor | editor.IStandaloneCodeEditor;
    // @ts-ignore
    const ts = window.tsUrl ? 0 : 200;
    setTimeout(() => {
      const div = document.getElementById(id) as HTMLDivElement;
      if (diffCode) {
        edit = editor.createDiffEditor(div, {
          theme:
            document.body.getAttribute("arco-theme") === "dark"
              ? "vs-dark"
              : "vs",
          enableSplitViewResizing: false,
          renderSideBySide: false,
          folding: true,
          foldingStrategy: "indentation",
          automaticLayout: true,
          overviewRulerBorder: false,
          scrollBeyondLastLine: false,
          readOnly: true,
          diffWordWrap: "off",
        });
        edit.setModel({
          original: editor.createModel(diffCode, "javascript"),
          modified: editor.createModel(code, "javascript"),
        });
      } else {
        edit = editor.create(div, {
          language: "javascript",
          theme:
            document.body.getAttribute("arco-theme") === "dark"
              ? "vs-dark"
              : "vs",
          folding: true,
          foldingStrategy: "indentation",
          automaticLayout: true,
          overviewRulerBorder: false,
          scrollBeyondLastLine: false,
          readOnly: !editable,
        });
        edit.setValue(code);
        setEditor(edit);
      }
    }, ts);
    return () => {
      if (edit) {
        edit.dispose();
      }
    };
  }, [code, diffCode]);
  return (
    <div
      id={id}
      style={{
        margin: 0,
        padding: 0,
        border: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
      className={className}
    />
  );
};

export default React.forwardRef(CodeEditor);
