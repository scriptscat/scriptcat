import type { AgentModelConfig } from "@App/app/service/agent/types";

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
  // 默认归入 OpenAI Compatible
  return { key: "other", label: "Other", order: 99 };
}

// 通过模型 ID 字符串检测是否支持视觉输入
export function supportsVisionByModelId(modelId: string): boolean {
  const m = modelId.toLowerCase();

  // OpenAI 视觉模型
  if (m.includes("gpt-4o") || m.includes("gpt-4-turbo") || m.includes("gpt-4-vision")) return true;
  if (m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return true;

  // Anthropic Claude 3+ 全部支持视觉
  if (
    m.startsWith("claude-3") ||
    m.startsWith("claude-sonnet") ||
    m.startsWith("claude-opus") ||
    m.startsWith("claude-haiku")
  )
    return true;

  // Google Gemini 基本都支持视觉
  if (m.startsWith("gemini")) return true;

  // Grok 视觉
  if (m.includes("grok") && m.includes("vision")) return true;

  // Qwen-VL
  if (m.includes("qwen") && (m.includes("vl") || m.includes("vision"))) return true;

  // GLM-4V
  if (m.includes("glm") && m.includes("v")) return true;

  // Pixtral (Mistral 视觉模型)
  if (m.startsWith("pixtral")) return true;

  // DeepSeek-VL
  if (m.includes("deepseek") && m.includes("vl")) return true;

  // Llama 视觉
  if (m.includes("llama") && (m.includes("vision") || m.includes("scout"))) return true;

  return false;
}

// 检测模型是否支持视觉输入（用户手动设置优先于自动检测）
export function supportsVision(model: AgentModelConfig): boolean {
  if (model.supportsVision !== undefined) return model.supportsVision;
  return supportsVisionByModelId(model.model);
}

// 通过模型 ID 字符串检测是否支持图片输出
export function supportsImageOutputByModelId(modelId: string): boolean {
  const m = modelId.toLowerCase();
  // GPT-4o 系列支持图片生成（不含 mini/audio）
  if (m.includes("gpt-4o") && !m.includes("mini") && !m.includes("audio")) return true;
  // Gemini 2.0 Flash 支持原生图片生成（不含 1.5 等旧版本）
  if (m.includes("gemini-2") && m.includes("flash") && !m.includes("lite")) return true;
  // Gemini 3+ 带 image 标识的模型支持图片生成
  if (m.includes("gemini-") && m.includes("image")) return true;
  // DALL-E
  if (m.startsWith("dall-e")) return true;
  return false;
}

// 检测模型是否支持图片输出（用户手动设置优先于自动检测）
export function supportsImageOutput(model: AgentModelConfig): boolean {
  if (model.supportsImageOutput !== undefined) return model.supportsImageOutput;
  return supportsImageOutputByModelId(model.model);
}

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
