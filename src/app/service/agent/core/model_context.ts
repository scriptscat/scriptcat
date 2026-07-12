import type { AgentModelConfig } from "./types";

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
export const DEFAULT_ANTHROPIC_MAX_TOKENS = 16_384;
export const CONTEXT_SAFETY_MARGIN_RATIO = 0.1;

/** 获取模型的上下文窗口大小，优先使用用户配置，否则按前缀匹配 */
export function getContextWindow(config: { model: string; contextWindow?: number }): number {
  // > 0 而非直接 truthy 判断：负数是 truthy，会原样返回并让 getInputTokenBudget() 的预算计算
  // 塌缩为 0（见 finding 10）
  if (typeof config.contextWindow === "number" && Number.isFinite(config.contextWindow) && config.contextWindow > 0) {
    return config.contextWindow;
  }
  const modelLower = config.model.toLowerCase();
  for (const [prefix, size] of MODEL_CONTEXT_PREFIXES) {
    if (modelLower.startsWith(prefix)) return size;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * 获取 provider 实际会请求的最大输出 token 数。
 * 未显式配置 maxTokens 时，不能按 0 预留：OpenAI 兼容请求体在这种情况下会直接省略
 * max_tokens 字段（见 providers/openai.ts），provider 侧会套用它自己的默认输出上限
 * （通常有实质数值，不是 0）。这里统一用一个有记录的保守默认值兜底，而不是假装输出不占预算，
 * 否则输入预算会把整个 contextWindow 都算给输入，实际请求的 输入+输出 可能超出真实上限
 * （见 finding 11）。
 */
export function getReservedOutputTokens(config: AgentModelConfig): number {
  const contextWindow = getContextWindow(config);
  const configured =
    typeof config.maxTokens === "number" && Number.isFinite(config.maxTokens)
      ? Math.max(0, Math.floor(config.maxTokens))
      : 0;
  const requested = configured > 0 ? configured : DEFAULT_ANTHROPIC_MAX_TOKENS;
  return Math.min(contextWindow, requested);
}

/**
 * 发送请求前允许输入占用的最大 token 预算。
 * contextWindow 是输入与输出的总和，因此需同时预留 provider 请求的输出额度和安全边际。
 */
export function getInputTokenBudget(config: AgentModelConfig): number {
  const contextWindow = getContextWindow(config);
  const safetyMargin = Math.ceil(contextWindow * CONTEXT_SAFETY_MARGIN_RATIO);
  return Math.max(0, contextWindow - getReservedOutputTokens(config) - safetyMargin);
}

/** 根据模型名称推断上下文窗口大小（不考虑用户配置） */
export function inferContextWindow(model: string): number {
  const modelLower = model.toLowerCase();
  for (const [prefix, size] of MODEL_CONTEXT_PREFIXES) {
    if (modelLower.startsWith(prefix)) return size;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

// 允许的 token 数上限：远超已知最大模型（Gemini/GPT-4.1 约 1M），为未来更大模型留余量，
// 同时拒绝明显异常的值（Infinity、Number.MAX_SAFE_INTEGER 等）
const MAX_REASONABLE_TOKEN_LIMIT = 10_000_000;

/**
 * 把用户可能填入的 maxTokens/contextWindow 归一化为有限正整数（或 undefined，交给下游默认值）。
 * 非有限数、非正数、超出合理范围一律视为未配置——防止负数因为 JS 的 truthy 判断被当作"已配置"
 * 直接发给 provider（如 Anthropic 的 max_tokens = config.maxTokens || 16384 会把负数原样发出），
 * 也防止负的 contextWindow 让 getInputTokenBudget() 的预算计算塌缩为 0（见 finding 10）。
 */
function normalizeTokenLimit(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.floor(value);
  if (normalized <= 0 || normalized > MAX_REASONABLE_TOKEN_LIMIT) return undefined;
  return normalized;
}

/** 在模型配置持久化前统一归一化 maxTokens/contextWindow，作为存储边界的唯一校验点。 */
export function normalizeModelLimits<T extends { maxTokens?: number; contextWindow?: number }>(config: T): T {
  return {
    ...config,
    maxTokens: normalizeTokenLimit(config.maxTokens),
    contextWindow: normalizeTokenLimit(config.contextWindow),
  };
}
