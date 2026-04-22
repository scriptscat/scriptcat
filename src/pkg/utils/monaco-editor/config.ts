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
  checkJs: true, // 启用 JS 类型检查以提供更好的智能提示
  noUnusedLocals: false, // 用户脚本中可能有意声明但未使用的变量,避免无用变量警告
  noFallthroughCasesInSwitch: false, // 允许 switch 穿透,用户脚本常见模式,减少警告
  noImplicitThis: false, // 用户脚本中 this 上下文可能不明确,避免相关警告
  strict: true,
} as languages.typescript.CompilerOptions;

export const defaultConfig = JSON.stringify(config, null, 2);
