// ScriptCat 设置备份 bundle：SystemConfig(sync+local) + agent 配置(模型/MCP/任务定义)
// 不含 OPFS 的 skills/对话历史/运行记录(agent 未发布、格式可破坏性变更、后续可无痛加)

export const CONFIG_BUNDLE_VERSION = 1;

// 不进设置备份的键：WebDAV/云同步凭据(出云同步范围 + 密码敏感,避免明文进 zip)
export const CONFIG_BUNDLE_EXCLUDE_KEYS = ["cloud_sync", "backup", "cat_file_storage"];

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

/** 构造进备份的 SystemConfig 分区：去 undefined + 去云同步凭据键 */
export function toBundleConfig(obj: Record<string, any>): Record<string, any> {
  const excl = new Set(CONFIG_BUNDLE_EXCLUDE_KEYS);
  const ret: Record<string, any> = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined && !excl.has(k)) ret[k] = obj[k];
  }
  return ret;
}
