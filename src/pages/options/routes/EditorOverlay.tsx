// ----------------------------------------------
// EditorOverlay.tsx (refactored to use ModalWrapper)
// ----------------------------------------------
import { useAppContext } from "@App/pages/store/AppContext";
import ModalWrapper from "./ModalWrapper";
import ScriptEditor from "./script/ScriptEditor";

/**
 * This overlay no longer re-mounts <ScriptEditor/> every time.
 * It will *move* the existing #scripteditor-container between the modal and the page host.
 * On first open (no target exists yet) it renders a fallback <ScriptEditor/> once inside the modal.
 */
export function EditorOverlay() {
  const { editorOpen, editorParams, closeEditor, updateEditorHash } = useAppContext();

  const portalRoot = document.getElementById("editor-overlay");
  if (!portalRoot) return null;

  return (
    <ModalWrapper
      open={editorOpen}
      onCancel={closeEditor}
      targetId="scripteditor-container"
      pageHostSelector="#scripteditor-layout-content"
      modalProps={{
        getChildrenPopupContainer: () => document.getElementById("editor-overlay-child") || document.body,
        // getPopupContainer: () => portalRoot,
        maskClosable: false,
        wrapClassName: "editor-modal-wrapper",
      }}
      fallback={
        <div id="scripteditor-container" style={{ height: "calc(100vh - 64px)" }}>
          <ScriptEditor
            uuid={editorParams?.uuid}
            template={editorParams?.template}
            target={editorParams?.target}
            overlayMode
            onUrlChange={updateEditorHash}
          />
        </div>
      }
    />
  );
}

export default EditorOverlay;
