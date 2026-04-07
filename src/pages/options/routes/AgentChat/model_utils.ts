import type { AgentModelConfig } from "@App/app/service/agent/core/types";

// 已知供应商信息
export type ProviderInfo = {
  key: string;
  label: string;
  order: number; // 排序权重，越小越靠前
};

// 通过模型名称或 API Base URL 推断供应商
export function detectProvider(model: AgentModelConfig): ProviderInfo {
  const m = model.model.toLowerCase();
  const url = model.apiBaseUrl.toLowerCase();

  // OpenAI
  if (
    m.startsWith("gpt-") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4") ||
    url.includes("openai.com")
  ) {
    return { key: "openai", label: "OpenAI", order: 1 };
  }
  // Anthropic
  if (m.startsWith("claude-") || url.includes("anthropic.com")) {
    return { key: "anthropic", label: "Anthropic", order: 2 };
  }
  // Google
  if (m.startsWith("gemini-") || url.includes("googleapis.com") || url.includes("generativelanguage")) {
    return { key: "google", label: "Google", order: 3 };
  }
  // DeepSeek
  if (m.startsWith("deepseek") || url.includes("deepseek")) {
    return { key: "deepseek", label: "DeepSeek", order: 4 };
  }
  // Meta / Llama
  if (m.startsWith("llama") || m.includes("llama")) {
    return { key: "meta", label: "Meta", order: 5 };
  }
  // Mistral
  if (m.startsWith("mistral") || m.startsWith("codestral") || m.startsWith("pixtral") || url.includes("mistral")) {
    return { key: "mistral", label: "Mistral", order: 6 };
  }
  // Groq
  if (url.includes("groq.com")) {
    return { key: "groq", label: "Groq", order: 7 };
  }
  // xAI / Grok
  if (m.startsWith("grok") || url.includes("x.ai")) {
    return { key: "xai", label: "xAI", order: 8 };
  }
  // Perplexity
  if (url.includes("perplexity")) {
    return { key: "perplexity", label: "Perplexity", order: 9 };
  }
  // Qwen / 通义千问
  if (m.startsWith("qwen") || url.includes("dashscope")) {
    return { key: "qwen", label: "Qwen", order: 10 };
  }
  // 月之暗面
  if (m.startsWith("moonshot") || url.includes("moonshot")) {
    return { key: "moonshot", label: "Moonshot", order: 11 };
  }
  // 智谱
  if (m.startsWith("glm") || url.includes("zhipuai") || url.includes("bigmodel")) {
    return { key: "zhipu", label: "Zhipu", order: 12 };
  }
  // 百度文心
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
  // 默认归入 OpenAI Compatible
  return { key: "other", label: "Other", order: 99 };
}

// 模型能力检测：从 core 层 re-export，避免 core 反向依赖 UI
export {
  supportsVisionByModelId,
  supportsVision,
  supportsImageOutputByModelId,
  supportsImageOutput,
} from "@App/app/service/agent/core/model_capabilities";

// 将模型按供应商分组
export type ModelGroup = {
  provider: ProviderInfo;
  models: AgentModelConfig[];
};

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

// 通过模型 ID 字符串推断供应商（用于 API 获取的模型列表）
export function detectProviderByModelId(modelId: string): ProviderInfo {
  const m = modelId.toLowerCase();
  if (
    m.startsWith("gpt-") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4") ||
    m.startsWith("dall-e") ||
    m.startsWith("tts") ||
    m.startsWith("whisper")
  ) {
    return { key: "openai", label: "OpenAI", order: 1 };
  }
  if (m.startsWith("claude-")) return { key: "anthropic", label: "Anthropic", order: 2 };
  if (m.startsWith("gemini")) return { key: "google", label: "Google", order: 3 };
  if (m.startsWith("deepseek")) return { key: "deepseek", label: "DeepSeek", order: 4 };
  if (m.includes("llama")) return { key: "meta", label: "Meta", order: 5 };
  if (m.startsWith("mistral") || m.startsWith("codestral") || m.startsWith("pixtral"))
    return { key: "mistral", label: "Mistral", order: 6 };
  if (m.startsWith("grok")) return { key: "xai", label: "xAI", order: 8 };
  if (m.startsWith("qwen")) return { key: "qwen", label: "Qwen", order: 10 };
  if (m.startsWith("moonshot")) return { key: "moonshot", label: "Moonshot", order: 11 };
  if (m.startsWith("glm")) return { key: "zhipu", label: "Zhipu", order: 12 };
  if (m.startsWith("ernie")) return { key: "baidu", label: "Baidu", order: 13 };
  return { key: "other", label: "Other", order: 99 };
}

// 将模型 ID 字符串按供应商分组
export type ModelIdGroup = {
  provider: ProviderInfo;
  modelIds: string[];
};

export function groupModelIdsByProvider(modelIds: string[]): ModelIdGroup[] {
  const groups = new Map<string, ModelIdGroup>();
  for (const id of modelIds) {
    const provider = detectProviderByModelId(id);
    let group = groups.get(provider.key);
    if (!group) {
      group = { provider, modelIds: [] };
      groups.set(provider.key, group);
    }
    group.modelIds.push(id);
  }
  return Array.from(groups.values()).sort((a, b) => a.provider.order - b.provider.order);
}
