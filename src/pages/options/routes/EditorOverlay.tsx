import { Modal } from "@arco-design/web-react";
import ScriptEditor from "./script/ScriptEditor";
import { useAppContext } from "@App/pages/store/AppContext";

export default function EditorOverlay() {
  const { editorOpen, editorParams, closeEditor, updateEditorHash } = useAppContext();

  return (
    <Modal
      visible={editorOpen}
      onCancel={closeEditor}
      footer={null}
      style={{ width: "96vw", maxWidth: "96vw" }}
      closeIcon={null}
    >
      <div style={{ height: "calc(100vh - 64px)" }}>
        <ScriptEditor
          uuid={editorParams?.uuid}
          template={editorParams?.template}
          target={editorParams?.target}
          overlayMode
          onUrlChange={updateEditorHash} // ← 關鍵：Core 改變活躍檔時通知外層更新 hash
        />
      </div>
    </Modal>
  );
}
