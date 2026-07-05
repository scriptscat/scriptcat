import type { AgentModelConfig } from "@App/app/service/agent/core/types";
import { Repo, loadCache } from "./repo";

const DEFAULT_MODEL_KEY = "agent_model:__default__";
const SUMMARY_MODEL_KEY = "agent_model:__summary__";

// 使用 chrome.storage.local 存储 Agent 模型配置
export class AgentModelRepo extends Repo<AgentModelConfig> {
  constructor() {
    super("agent_model:");
    this.enableCache();
  }

  // 获取所有模型（排除 __default__ / __summary__ 等内部 key）
  async listModels(): Promise<AgentModelConfig[]> {
    return this.find((key) => !key.startsWith(`${this.prefix}__`));
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

  // 获取默认模型 ID（通过缓存层读取，避免绕过缓存导致不一致）
  async getDefaultModelId(): Promise<string> {
    const cache = await loadCache();
    return (cache[DEFAULT_MODEL_KEY] as string) || "";
  }

  // 设置默认模型 ID（同时更新缓存和 storage）
  async setDefaultModelId(id: string): Promise<void> {
    const cache = await loadCache();
    cache[DEFAULT_MODEL_KEY] = id;
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ [DEFAULT_MODEL_KEY]: id }, () => {
        resolve();
      });
    });
  }

  // 获取摘要模型 ID
  async getSummaryModelId(): Promise<string> {
    const cache = await loadCache();
    return (cache[SUMMARY_MODEL_KEY] as string) || "";
  }

  // 设置摘要模型 ID
  async setSummaryModelId(id: string): Promise<void> {
    const cache = await loadCache();
    cache[SUMMARY_MODEL_KEY] = id;
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ [SUMMARY_MODEL_KEY]: id }, () => {
        resolve();
      });
    });
  }
}
