import { useAppContext } from "@App/pages/store/AppContext";
import ScriptEditor from "./ScriptEditor";

export default function ScriptEditorRoute() {
  const { editorOpen } = useAppContext(); // ← Overlay 是否開啟

  // 🔒 當 Overlay 開啟時，URL 模式暫停渲染，避免雙實例互相干擾
  if (editorOpen) return <></>;

  // URL 模式下 overlayMode 必須為 false，啟用 onbeforeunload/popstate
  return (
    <div
      id="scripteditor-pagebox"
      className="scripteditor-in-page"
      style={{ height: "100%", width: "100%", position: "relative" }}
    >
      <ScriptEditor overlayMode={false} />
    </div>
  );
}
