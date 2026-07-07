// Agent 通用设置（对话行为相关，非 Skill/Model/Search 等专项配置）

export type AgentGeneralConfig = {
  chatMaxIterations: number; // UI 对话的 tool calling 最大循环次数
};

const STORAGE_KEY = "agent_general_config";

export const DEFAULT_CHAT_MAX_ITERATIONS = 50;
export const MIN_CHAT_MAX_ITERATIONS = 1;
export const MAX_CHAT_MAX_ITERATIONS = 1000;

const DEFAULT_CONFIG: AgentGeneralConfig = {
  chatMaxIterations: DEFAULT_CHAT_MAX_ITERATIONS,
};

// 归一化 chatMaxIterations：非法/非有限值回退默认值，其余四舍五入并截断到 [MIN, MAX]。
// 由 repo 统一把关，防止损坏的 storage、旧版本遗留值、或绕过 Settings UI 的调用方写入越界值。
// 同时导出供 ChatService 校验直接传入的 maxIterations（例如显式传入负数等非法值）。
export function normalizeChatMaxIterations(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CHAT_MAX_ITERATIONS;
  return Math.min(MAX_CHAT_MAX_ITERATIONS, Math.max(MIN_CHAT_MAX_ITERATIONS, Math.round(value)));
}

export class AgentConfigRepo {
  async getConfig(): Promise<AgentGeneralConfig> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY] as Partial<AgentGeneralConfig> | undefined;
      return { chatMaxIterations: normalizeChatMaxIterations(stored?.chatMaxIterations) };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  async saveConfig(config: AgentGeneralConfig): Promise<void> {
    const normalized: AgentGeneralConfig = { chatMaxIterations: normalizeChatMaxIterations(config.chatMaxIterations) };
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  }
}
