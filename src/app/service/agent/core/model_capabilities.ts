import type { AgentModelConfig } from "./types";

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
