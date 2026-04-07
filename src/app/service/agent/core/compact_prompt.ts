export const COMPACT_SYSTEM_PROMPT = `You are a conversation summarizer. Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions. This summary will replace the conversation history, enabling efficient task resumption in a new context window.`;

export function buildCompactUserPrompt(customInstruction?: string): string {
  let prompt = `Write a structured, concise, and actionable continuation summary of the conversation so far. First analyze the conversation in <analysis> tags, then write the summary in <summary> tags.

Include the following sections in your <summary>:

1. **Task Overview**
   - The user's core request and success criteria
   - Any clarifications or constraints they specified

2. **Current State**
   - What has been completed so far
   - Pages visited, data extracted, or actions performed (with URLs/selectors if relevant)
   - Key outputs or artifacts produced

3. **User Messages**
   - List ALL user messages that are not tool results
   - These are critical for understanding the user's feedback and changing intent
   - Include any mid-conversation corrections or preference changes

4. **Errors and Fixes**
   - All errors encountered and how they were resolved
   - User feedback on errors (especially "do it differently" instructions)
   - What approaches were tried that didn't work (and why)

5. **Important Discoveries**
   - Technical constraints or site-specific quirks uncovered
   - Decisions made and their rationale
   - Selectors, page structures, or API endpoints discovered that may be needed again

6. **Current Work**
   - Precisely what was being worked on immediately before this summary
   - Include specific details: which page, which step, what was the last action
   - If a sub-agent was running, what was its task and status

7. **Next Steps**
   - Specific actions needed to complete the task
   - Any blockers or open questions to resolve
   - Priority order if multiple steps remain
   - If there is a next step, describe exactly where you left off to prevent task drift

8. **Context to Preserve**
   - User preferences or style requirements
   - Domain-specific details that aren't obvious
   - Any promises or commitments made to the user

Be concise but complete — err on the side of including information that would prevent duplicate work or repeated mistakes.`;

  if (customInstruction) {
    prompt += `\n\nAdditional summarization instructions from the user: ${customInstruction}`;
  }

  return prompt;
}

/** 从 LLM 响应中提取 <summary> 标签内容，跳过 <analysis> 部分 */
export function extractSummary(content: string): string {
  const match = content.match(/<summary>([\s\S]*?)<\/summary>/);
  return match ? match[1].trim() : content.trim();
}
