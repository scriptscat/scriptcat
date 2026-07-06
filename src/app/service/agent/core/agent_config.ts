// Agent 通用设置（对话行为相关，非 Skill/Model/Search 等专项配置）

export type AgentGeneralConfig = {
  chatMaxIterations: number; // UI 对话的 tool calling 最大循环次数
};

const STORAGE_KEY = "agent_general_config";

export const DEFAULT_CHAT_MAX_ITERATIONS = 50;

const DEFAULT_CONFIG: AgentGeneralConfig = {
  chatMaxIterations: DEFAULT_CHAT_MAX_ITERATIONS,
};

export class AgentConfigRepo {
  async getConfig(): Promise<AgentGeneralConfig> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY] as Partial<AgentGeneralConfig> | undefined;
      return { ...DEFAULT_CONFIG, ...stored };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  async saveConfig(config: AgentGeneralConfig): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: config });
  }
}
