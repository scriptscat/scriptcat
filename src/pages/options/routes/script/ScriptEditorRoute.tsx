import { useParams, useSearchParams } from "react-router-dom";
import { useAppContext } from "@App/pages/store/AppContext";
import ScriptEditor from "./ScriptEditor";

export default function ScriptEditorRoute() {
  const { editorOpen } = useAppContext(); // ← Overlay 是否開啟
  const { uuid } = useParams<{ uuid?: string }>();
  const [sp] = useSearchParams();
  const template = (sp.get("template") || undefined) as "" | "background" | "crontab" | undefined;
  const target = (sp.get("target") as "blank" | "initial" | null) || undefined;

  // 🔒 當 Overlay 開啟時，URL 模式暫停渲染，避免雙實例互相干擾
  if (editorOpen) return null;

  // URL 模式下 overlayMode 必須為 false，啟用 onbeforeunload/popstate
  return <ScriptEditor uuid={uuid} template={template} target={target} overlayMode={false} />;
}
