import { STORAGE_LOCAL_KEYS } from "@App/pkg/config/consts";
import type { AgentModelConfig, AgentTask, MCPServerConfig } from "@App/app/service/agent/core/types";

// ScriptCat 设置备份 bundle：SystemConfig(仅跨设备同步键) + agent 配置(模型/MCP/任务定义)
// 本机相关配置(STORAGE_LOCAL_KEYS)不进备份；不含 OPFS 的 skills/对话历史/运行记录

export const CONFIG_BUNDLE_VERSION = 1;

export type ConfigBundle = {
  version: number;
  systemConfig: Record<string, any>; // 扁平：仅 chrome.storage.sync 的 system 键
  agent: {
    models: AgentModelConfig[];
    mcp: MCPServerConfig[];
    tasks: AgentTask[];
    defaultModelId: string;
    summaryModelId: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 在备份文件边界校验版本与必要结构，避免损坏或未来格式被部分写入。 */
export function parseConfigBundle(value: unknown): ConfigBundle {
  if (!isRecord(value)) throw new Error("Invalid config bundle");
  if (value.version !== CONFIG_BUNDLE_VERSION) {
    throw new Error(`Unsupported config bundle version: ${String(value.version)}`);
  }
  const systemConfig = value.systemConfig;
  const agent = value.agent;
  if (
    !isRecord(systemConfig) ||
    // 旧的嵌套结构（systemConfig.sync / .local）——配置键里不存在名为 sync/local 的键，
    // 出现即为旧格式，直接判非法（功能未发布，不迁移）
    "sync" in systemConfig ||
    "local" in systemConfig ||
    !isRecord(agent) ||
    !Array.isArray(agent.models) ||
    !Array.isArray(agent.mcp) ||
    !Array.isArray(agent.tasks) ||
    typeof agent.defaultModelId !== "string" ||
    typeof agent.summaryModelId !== "string"
  ) {
    throw new Error("Invalid config bundle");
  }
  return value as ConfigBundle;
}

/** 构造进备份的 SystemConfig：去 undefined + 去本机相关键(STORAGE_LOCAL_KEYS) */
export function toBundleConfig(obj: Record<string, any>): Record<string, any> {
  const ret: Record<string, any> = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined && !STORAGE_LOCAL_KEYS.has(k)) ret[k] = obj[k];
  }
  return ret;
}
