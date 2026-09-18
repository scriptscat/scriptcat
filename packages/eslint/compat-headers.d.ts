// compat-headers.js 是给 rspack alias 用的 CommonJS 覆盖文件（见 rspack.config.ts），
// 这里只声明测试与类型检查需要的形状。
export declare const compatMap: {
  localized: Record<string, unknown>;
  unlocalized: Record<string, unknown>;
  nonFunctional: Record<string, unknown>;
};
