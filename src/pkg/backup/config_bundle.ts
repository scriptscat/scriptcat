// ScriptCat 设置备份 bundle：SystemConfig(sync+local) + agent 配置(模型/MCP/任务定义)
// 不含 OPFS 的 skills/对话历史/运行记录(agent 未发布、格式可破坏性变更、后续可无痛加)

export const CONFIG_BUNDLE_VERSION = 1;

export type ConfigBundle = {
  version: number;
  systemConfig: { sync: Record<string, any>; local: Record<string, any> };
  agent: { models: any[]; mcp: any[]; tasks: any[] };
};

/** 过滤掉值为 undefined 的键(chrome.storage.keys 结果可能带空值) */
export function pickBundleKeys(obj: Record<string, any>): Record<string, any> {
  const ret: Record<string, any> = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined) ret[k] = obj[k];
  }
  return ret;
}
