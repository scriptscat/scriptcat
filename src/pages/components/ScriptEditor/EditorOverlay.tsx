// ----------------------------------------------
// EditorOverlay.tsx (refactored to use ModalWrapper)
// ----------------------------------------------
import { useAppContext } from "@App/pages/store/AppContext";
import ModalWrapper from "./ModalWrapper";
import ScriptEditor from "./ScriptEditor";

/**
 * This overlay no longer re-mounts <ScriptEditor/> every time.
 * It will *move* the existing #scripteditor-modal-container between the modal and the page host.
 * On first open (no target exists yet) it renders a fallback <ScriptEditor/> once inside the modal.
 */
export function EditorOverlay() {
  const { editorOpen, closeEditor, updateEditorHash } = useAppContext();

  return (
    <ModalWrapper
      open={editorOpen}
      onCancel={closeEditor}
      targetId="scripteditor-modal-container"
      pageHostSelector="#scripteditor-layout-content"
      modalProps={{
        getChildrenPopupContainer: () => document.getElementById("editor-children-popup") || document.body,
        // getPopupContainer: () => portalRoot,
        maskClosable: false,
        wrapClassName: "editor-modal-wrapper",
      }}
      fallback={
        <div id="scripteditor-modal-container" style={{ height: "calc(100vh - 64px)" }}>
          <ScriptEditor overlayMode onUrlChange={updateEditorHash} />
        </div>
      }
    />
  );
}

export default EditorOverlay;
