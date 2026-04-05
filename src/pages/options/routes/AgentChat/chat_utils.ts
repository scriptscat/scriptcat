import type { ChatMessage, MessageContent } from "@App/app/service/agent/core/types";

// 将消息按角色分组：连续的 assistant 消息合并为一组
export type MessageGroup = { type: "user"; message: ChatMessage } | { type: "assistant"; messages: ChatMessage[] };

// 将 tool 角色消息的结果合并到 assistant 消息的 toolCalls 中，并过滤掉 tool/system 消息
export function mergeToolResults(messages: ChatMessage[]): ChatMessage[] {
  const toolResultMap = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === "tool" && msg.toolCallId) {
      // tool 消息的 content 始终是 string
      toolResultMap.set(msg.toolCallId, typeof msg.content === "string" ? msg.content : "");
    }
  }

  return messages
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => {
      if (msg.role === "assistant" && msg.toolCalls && toolResultMap.size > 0) {
        const updatedToolCalls = msg.toolCalls.map((tc) => {
          const result = toolResultMap.get(tc.id);
          if (result !== undefined) {
            return { ...tc, result, status: (tc.status || "completed") as typeof tc.status };
          }
          return tc;
        });
        return { ...msg, toolCalls: updatedToolCalls };
      }
      return msg;
    });
}

export function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      groups.push({ type: "user", message: msg });
    } else {
      const last = groups[groups.length - 1];
      if (last && last.type === "assistant") {
        last.messages.push(msg);
      } else {
        groups.push({ type: "assistant", messages: [msg] });
      }
    }
  }
  return groups;
}

// 计算重新生成操作需要删除的消息 ID 和保留的消息
// 输入: assistant 组在 groups 中的 groupIndex
// 返回: { idsToDelete, remainingMessages, userContent } 或 null（无法执行）
export function computeRegenerateAction(
  groups: MessageGroup[],
  assistantGroupIndex: number,
  allMessages: ChatMessage[]
): { idsToDelete: string[]; remainingMessages: ChatMessage[]; userContent: MessageContent } | null {
  const group = groups[assistantGroupIndex];
  if (!group || group.type !== "assistant") return null;

  // 找到前面的用户消息
  let userMessage: ChatMessage | null = null;
  for (let i = assistantGroupIndex - 1; i >= 0; i--) {
    if (groups[i].type === "user") {
      userMessage = (groups[i] as { type: "user"; message: ChatMessage }).message;
      break;
    }
  }
  if (!userMessage) return null;

  // 收集需要删除的消息 ID（assistant 组 + 用户消息）
  const idsToDelete = group.messages.map((m) => m.id);
  idsToDelete.push(userMessage.id);

  // 重建消息列表
  const idSet = new Set(idsToDelete);
  const remainingMessages = allMessages.filter((m) => !idSet.has(m.id));

  return { idsToDelete, remainingMessages, userContent: userMessage.content };
}

// 计算编辑消息操作需要删除的消息 ID 和保留的消息
export function computeEditAction(
  messageId: string,
  allMessages: ChatMessage[]
): { idsToDelete: string[]; remainingMessages: ChatMessage[] } | null {
  const idx = allMessages.findIndex((m) => m.id === messageId);
  if (idx < 0) return null;

  const idsToDelete = allMessages.slice(idx).map((m) => m.id);
  const remainingMessages = allMessages.slice(0, idx);

  return { idsToDelete, remainingMessages };
}

// 根据用户消息在 groups 中的位置，找到对应的 assistant 组索引
// 用于"用户消息重新生成"场景
export function findNextAssistantGroupIndex(groups: MessageGroup[], userGroupIndex: number): number | null {
  if (userGroupIndex + 1 < groups.length && groups[userGroupIndex + 1].type === "assistant") {
    return userGroupIndex + 1;
  }
  return null;
}

// 计算用户消息重新生成的操作：保留用户消息本身，只删除后续回复
// 返回 { idsToDelete, remainingMessages, userContent, skipUserMessage: true }
export function computeUserRegenerateAction(
  messageId: string,
  allMessages: ChatMessage[]
): {
  idsToDelete: string[];
  remainingMessages: ChatMessage[];
  userContent: MessageContent;
  skipUserMessage: true;
} | null {
  const idx = allMessages.findIndex((m) => m.id === messageId);
  if (idx < 0) return null;

  const userContent = allMessages[idx].content;

  // 只删除用户消息之后的回复（保留用户消息本身）
  const idsToDelete = allMessages.slice(idx + 1).map((m) => m.id);

  // 保留到用户消息为止（含用户消息）
  const remainingMessages = allMessages.slice(0, idx + 1);

  return { idsToDelete, remainingMessages, userContent, skipUserMessage: true };
}
