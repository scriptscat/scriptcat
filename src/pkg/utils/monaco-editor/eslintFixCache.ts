import type { editor, IRange } from "monaco-editor";

export type EslintFix = {
  range: IRange;
  text: string;
};

type EslintFixMarkerPosition = Pick<
  editor.IMarkerData,
  "startLineNumber" | "endLineNumber" | "startColumn" | "endColumn"
>;

export const getEslintFixKey = (
  modelUri: string,
  eslintRuleId: string,
  marker: EslintFixMarkerPosition
) => {
  return `${modelUri}|${eslintRuleId}|${marker.startLineNumber}|${marker.endLineNumber}|${marker.startColumn}|${marker.endColumn}`;
};

export const getModelEslintFixKey = (
  model: editor.ITextModel,
  eslintRuleId: string,
  marker: EslintFixMarkerPosition
) => getEslintFixKey(model.uri.toString(), eslintRuleId, marker);

export const clearModelEslintFixes = (eslintFixMap: Map<string, EslintFix>, model: editor.ITextModel) => {
  const prefix = `${model.uri.toString()}|`;
  for (const key of eslintFixMap.keys()) {
    if (key.startsWith(prefix)) {
      eslintFixMap.delete(key);
    }
  }
};
