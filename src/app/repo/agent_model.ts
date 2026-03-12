import type { AgentModelConfig } from "@App/app/service/agent/types";
import { Repo } from "./repo";

const DEFAULT_MODEL_KEY = "agent_model:__default__";

// 使用 chrome.storage.local 存储 Agent 模型配置
export class AgentModelRepo extends Repo<AgentModelConfig> {
  constructor() {
    super("agent_model:");
  }

  // 获取所有模型
  async listModels(): Promise<AgentModelConfig[]> {
    return this.find();
  }

  // 获取指定模型
  async getModel(id: string): Promise<AgentModelConfig | undefined> {
    return this.get(id);
  }

  // 保存模型
  async saveModel(model: AgentModelConfig): Promise<void> {
    await this._save(model.id, model);
  }

  // 删除模型
  async removeModel(id: string): Promise<void> {
    await this.delete(id);
  }

  // 获取默认模型 ID（独立 key，不复用 Repo<AgentModelConfig> 的 get）
  async getDefaultModelId(): Promise<string> {
    return new Promise<string>((resolve) => {
      chrome.storage.local.get(DEFAULT_MODEL_KEY, (result) => {
        resolve(result[DEFAULT_MODEL_KEY] || "");
      });
    });
  }

  // 设置默认模型 ID
  async setDefaultModelId(id: string): Promise<void> {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ [DEFAULT_MODEL_KEY]: id }, () => {
        resolve();
      });
    });
  }
}
