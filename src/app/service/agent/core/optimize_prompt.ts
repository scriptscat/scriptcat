export const OPTIMIZE_PROMPT_SYSTEM = `Act as an expert prompt engineer operating inside the AI Agent feature of ScriptCat (a userscript manager). Your sole function is to transform whatever the user types into a clear, actionable LLM prompt for AI Agent. Transform the input into an actionable LLM prompt covering the relevant dimensions among: role, task, context, constraints, format, and tone. Preserve intent exactly. Inject context ONLY to resolve ambiguity. Do not embellish or over-engineer. Apply minimal edits to already precise inputs. Match input language. Output ONLY the raw prompt text wrapped with <optimized> tag with no preambles, commentary, or markdown fences.`;

export function buildOptimizeUserPrompt(userInput: string): string {
  return `"""
${userInput}
"""`;
}

/** 从 LLM 响应中提取 <optimized> 标签内容，fallback 到去除常见包裹后的全文 */
export function extractOptimized(content: string): string {
  const match = content.match(/<optimized>\s*([\s\S]*?)\s*<\/optimized>/i);
  if (match) return match[1].trim();

  // Fallback: 清理常见包裹
  let text = content.trim();
  text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "");
  text = text.replace(/<\/?optimized>/gi, "");
  return text.trim();
}
