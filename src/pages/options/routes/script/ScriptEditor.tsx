import { ScriptDAO } from "@App/app/repo/scripts";
import CodeEditor from "@App/pages/components/CodeEditor";
import React, { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { editor } from "monaco-editor";

function ScriptEditor() {
  // const [script, setScript] = useState<Script>();
  const codeEditor = useRef<{ editor: editor.ICodeEditor }>(null);

  const { id } = useParams();
  if (!id) {
    return <>not found</>;
  }

  useEffect(() => {
    const dao = new ScriptDAO();
    dao.findById(parseInt(id, 10)).then((resp) => {
      if (!resp) {
        return;
      }
      // setScript(resp);
      console.log(codeEditor);
      codeEditor.current?.editor.setValue(resp.code);
    });
    return () => {
      codeEditor.current?.editor.dispose();
    };
  }, []);

  return (
    <div style={{ height: "100%" }}>
      <CodeEditor ref={codeEditor} code="" diffCode="" />
    </div>
  );
}

export default ScriptEditor;
