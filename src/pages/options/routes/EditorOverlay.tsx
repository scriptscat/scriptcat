import { Modal } from "@arco-design/web-react";
import ScriptEditor from "./script/ScriptEditor";
import { useAppContext } from "@App/pages/store/AppContext";
import { createPortal } from "react-dom";

export default function EditorOverlay() {
  const { editorOpen, editorParams, closeEditor, updateEditorHash } = useAppContext();

  const element = document.getElementById("editor-overlay");
  const elementChild = document.getElementById("editor-overlay-child");
  if (!element || !elementChild) return <></>;
  return createPortal(
    <div id="modal-container">
      <Modal
        visible={editorOpen}
        onCancel={closeEditor}
        getChildrenPopupContainer={() => elementChild}
        footer={null}
        style={{ width: "96vw", maxWidth: "96vw" }}
        closeIcon={null}
      >
        <div id="scripteditor-container" style={{ height: "calc(100vh - 64px)" }}>
          <ScriptEditor
            uuid={editorParams?.uuid}
            template={editorParams?.template}
            target={editorParams?.target}
            overlayMode
            onUrlChange={updateEditorHash} // ← 關鍵：Core 改變活躍檔時通知外層更新 hash
          />
        </div>
      </Modal>
    </div>,
    element
  );
}
