import { editor } from "monaco-editor";
import React, { useEffect } from "react";

const CodeEditor: React.FC<{
  className?: string;
}> = ({ className }) => {
  useEffect(() => {
    let edit: editor.IEditor;
    // @ts-ignore
    const ts = window.tsUrl ? 0 : 200;
    setTimeout(() => {
      const div = document.querySelector("#editor") as HTMLDivElement;
      edit = editor.create(div, {
        value: "Hello World",
        language: "javascript",
        folding: true,
        foldingStrategy: "indentation",
        automaticLayout: true,
        overviewRulerBorder: false,
        scrollBeyondLastLine: false,
        readOnly: true,
      });
    }, ts);
    return () => {
      if (edit) {
        edit.dispose();
      }
    };
  }, []);
  return (
    <div
      id="editor"
      style={{
        margin: 0,
        padding: 0,
        border: 0,
        width: "100%",
        height: "100%",
      }}
      className={className}
    />
  );
};

CodeEditor.defaultProps = {
  className: "",
};

export default CodeEditor;
