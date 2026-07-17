import type { AgentModelConfig } from "@App/app/service/agent/core/types";

// 模型能力检测：从 core 层 re-export，避免 core 反向依赖 UI（核心逻辑由 core 测试覆盖）
export { supportsVision, supportsImageOutput } from "@App/app/service/agent/core/model_capabilities";

/** 供应商信息：key 用于图标/分组，label 展示，order 为排序权重（越小越靠前） */
export type ProviderInfo = {
  key: string;
  label: string;
  order: number;
};

/** 通过模型名称或 API Base URL 推断供应商 */
export function detectProvider(model: AgentModelConfig): ProviderInfo {
  const m = model.model.toLowerCase();
  const url = model.apiBaseUrl.toLowerCase();

  if (
    m.startsWith("gpt-") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4") ||
    url.includes("openai.com")
  ) {
    return { key: "openai", label: "OpenAI", order: 1 };
  }
  if (m.startsWith("claude-") || url.includes("anthropic.com")) {
    return { key: "anthropic", label: "Anthropic", order: 2 };
  }
  if (m.startsWith("gemini-") || url.includes("googleapis.com") || url.includes("generativelanguage")) {
    return { key: "google", label: "Google", order: 3 };
  }
  if (m.startsWith("deepseek") || url.includes("deepseek")) {
    return { key: "deepseek", label: "DeepSeek", order: 4 };
  }
  if (m.startsWith("llama") || m.includes("llama")) {
    return { key: "meta", label: "Meta", order: 5 };
  }
  if (m.startsWith("mistral") || m.startsWith("codestral") || m.startsWith("pixtral") || url.includes("mistral")) {
    return { key: "mistral", label: "Mistral", order: 6 };
  }
  if (url.includes("groq.com")) {
    return { key: "groq", label: "Groq", order: 7 };
  }
  if (m.startsWith("grok") || url.includes("x.ai")) {
    return { key: "xai", label: "xAI", order: 8 };
  }
  if (url.includes("perplexity")) {
    return { key: "perplexity", label: "Perplexity", order: 9 };
  }
  if (m.startsWith("qwen") || url.includes("dashscope")) {
    return { key: "qwen", label: "Qwen", order: 10 };
  }
  if (m.startsWith("moonshot") || url.includes("moonshot")) {
    return { key: "moonshot", label: "Moonshot", order: 11 };
  }
  if (m.startsWith("glm") || url.includes("zhipuai") || url.includes("bigmodel")) {
    return { key: "zhipu", label: "Zhipu", order: 12 };
  }
  if (m.startsWith("ernie") || url.includes("baidu") || url.includes("bce")) {
    return { key: "baidu", label: "Baidu", order: 13 };
  }

  // 根据 provider 字段兜底
  if (model.provider === "anthropic") {
    return { key: "anthropic", label: "Anthropic", order: 2 };
  }
  if (model.provider === "zhipu") {
    return { key: "zhipu", label: "Zhipu", order: 12 };
  }
  return { key: "other", label: "Other", order: 99 };
}

/** 同供应商的模型分为一组 */
export type ModelGroup = {
  provider: ProviderInfo;
  models: AgentModelConfig[];
};

/** 将模型按供应商分组并按 order 排序 */
export function groupModelsByProvider(models: AgentModelConfig[]): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();
  for (const model of models) {
    const provider = detectProvider(model);
    let group = groups.get(provider.key);
    if (!group) {
      group = { provider, models: [] };
      groups.set(provider.key, group);
    }
    group.models.push(model);
  }
  return Array.from(groups.values()).sort((a, b) => a.provider.order - b.provider.order);
}
