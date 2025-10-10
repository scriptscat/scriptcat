import { useParams, useSearchParams } from "react-router-dom";
import ScriptEditor from "./ScriptEditor";

export default function ScriptEditorRoute() {
  const { uuid } = useParams();
  const [sp] = useSearchParams();
  const template = sp.get("template") || undefined;
  const target = (sp.get("target") as "blank" | "initial" | null) || undefined;

  return <ScriptEditor uuid={uuid} template={template} target={target} overlayMode={false} />;
}
