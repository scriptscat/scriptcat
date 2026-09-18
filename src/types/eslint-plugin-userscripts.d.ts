// 未经 packages/eslint 覆盖的上游数据，script_compat.test.ts 用它推出哪些指令是脚本猫独有的
declare module "eslint-plugin-userscripts/dist/data/compat-headers.js" {
  export const compatMap: {
    localized: Record<string, unknown>;
    unlocalized: Record<string, unknown>;
    nonFunctional: Record<string, unknown>;
  };
}
