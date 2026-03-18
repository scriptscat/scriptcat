export const COMPACT_SYSTEM_PROMPT = `You are a conversation summarizer. Your task is to create a detailed summary of the conversation, preserving all critical information needed to continue effectively.`;

export function buildCompactUserPrompt(customInstruction?: string): string {
  let prompt = `Create a detailed summary of the conversation so far.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts:

1. Chronologically analyze each message. For each section identify:
   - The user's explicit requests and intents
   - Key decisions and outcomes
   - Specific details: file names, code snippets, function signatures
   - Errors encountered and how they were fixed
   - Important user feedback or corrections

2. Double-check for completeness.

Your summary should include the following sections in <summary> tags:

1. **Primary Request and Intent**: The user's core requests and success criteria
2. **Key Decisions**: Important decisions made and their rationale
3. **Current State**: What has been completed, files modified, artifacts produced
4. **Errors and Fixes**: Problems encountered and their solutions
5. **Pending Tasks**: Outstanding work items
6. **Current Work**: What was being worked on immediately before this summary
7. **Next Steps**: Specific actions needed to continue

Be concise but complete — preserve all information that would prevent duplicate work or repeated mistakes.`;

  if (customInstruction) {
    prompt += `\n\nAdditional summarization instructions from the user: ${customInstruction}`;
  }

  return prompt;
}

/** 从 LLM 响应中提取 <summary> 标签内容 */
export function extractSummary(content: string): string {
  const match = content.match(/<summary>([\s\S]*?)<\/summary>/);
  return match ? match[1].trim() : content.trim();
}
