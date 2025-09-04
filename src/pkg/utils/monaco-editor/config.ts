import type { languages } from "monaco-editor";

const config = {
  noSemanticValidation: true,
  noSyntaxValidation: false,
  onlyVisible: false,
} as languages.typescript.CompilerOptions;

export const defaultConfig = JSON.stringify(config, null, 2);
