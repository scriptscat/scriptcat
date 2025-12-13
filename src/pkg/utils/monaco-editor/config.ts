import type { languages } from "monaco-editor";

const config = {
  noSemanticValidation: true,
  noSyntaxValidation: false,
  onlyVisible: false,
  // 该配置用于修复 Error: Could not find source file: 'inmemory://model/1'.
  // https://github.com/microsoft/monaco-editor/issues/1842
  // https://github.com/suren-atoyan/monaco-react/issues/75#issuecomment-1890761086
  allowNonTsExtensions: true,
  allowJs: true,
  checkJs: true,
  noUnusedLocals: false,
  noFallthroughCasesInSwitch: false,
  noImplicitThis: false,
  strict: true,
} as languages.typescript.CompilerOptions;

export const defaultConfig = JSON.stringify(config, null, 2);
