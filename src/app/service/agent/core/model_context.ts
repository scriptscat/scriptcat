// 模型上下文窗口大小映射表
// [前缀, 上下文窗口大小]，按前缀长度降序排列以确保最精确匹配优先
const MODEL_CONTEXT_PREFIXES: Array<[string, number]> = [
  // OpenAI — GPT-5 系列
  ["gpt-5", 400_000],
  // OpenAI — GPT-4.1 系列
  ["gpt-4.1", 1_047_576],
  // OpenAI — GPT-4o 系列
  ["gpt-4o", 128_000],
  // OpenAI — GPT-4 Turbo
  ["gpt-4-turbo", 128_000],
  // OpenAI — GPT-4 基础
  ["gpt-4", 8_192],
  // OpenAI — GPT-3.5
  ["gpt-3.5", 16_385],
  // OpenAI — o 系列推理模型
  ["o1", 200_000],
  ["o3", 200_000],
  ["o4", 200_000],
  // Anthropic — Claude 系列（所有版本都是 200K）
  ["claude", 200_000],
  // Google — Gemini 系列
  ["gemini", 1_048_576],
  // Google — Gemma（本地部署）
  ["gemma", 128_000],
  // DeepSeek
  ["deepseek", 64_000],
  // Alibaba — Qwen 系列
  ["qwen", 131_072],
  ["qwq", 32_000],
  // Meta — Llama 系列
  ["llama-4", 1_048_576],
  ["llama", 131_072],
  // Mistral
  ["mistral-nemo", 128_000],
  ["mistral", 32_000],
  // Microsoft — Phi
  ["phi", 16_000],
  // GLM
  ["glm", 200_000],
];

export const DEFAULT_CONTEXT_WINDOW = 128_000;

/** 获取模型的上下文窗口大小，优先使用用户配置，否则按前缀匹配 */
export function getContextWindow(config: { model: string; contextWindow?: number }): number {
  if (config.contextWindow) return config.contextWindow;
  const modelLower = config.model.toLowerCase();
  for (const [prefix, size] of MODEL_CONTEXT_PREFIXES) {
    if (modelLower.startsWith(prefix)) return size;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/** 根据模型名称推断上下文窗口大小（不考虑用户配置） */
export function inferContextWindow(model: string): number {
  const modelLower = model.toLowerCase();
  for (const [prefix, size] of MODEL_CONTEXT_PREFIXES) {
    if (modelLower.startsWith(prefix)) return size;
  }
  return DEFAULT_CONTEXT_WINDOW;
}
