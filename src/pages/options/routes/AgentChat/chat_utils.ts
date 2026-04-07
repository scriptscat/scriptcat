import type { ChatMessage, MessageContent, SubAgentDetails } from "@App/app/service/agent/core/types";
import type { SubAgentState } from "./SubAgentBlock";

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

// 匹配 agent 工具调用对应的子代理状态
// 从 MessageItem 提取，方便单元测试
export function getSubAgentForToolCall(
  tc: {
    name: string;
    result?: string;
    arguments?: string;
    subAgentDetails?: SubAgentDetails;
  },
  subAgents?: Map<string, SubAgentState>
): SubAgentState | undefined {
  if (tc.name !== "agent") return undefined;

  // 1. 从流式 subAgents map 匹配（优先，因为包含实时状态）
  if (subAgents) {
    // 1a. 从已完成的结果中匹配（格式: "[agentId: xxx]\n\n..."）
    if (tc.result) {
      const match = tc.result.match(/^\[agentId: ([^\]]+)\]/);
      if (match) {
        const sa = subAgents.get(match[1]);
        if (sa) return sa;
      }
    }
    // 1b. 从参数中匹配 to 字段（resume 场景）
    if (tc.arguments) {
      try {
        const args = JSON.parse(tc.arguments);
        if (args.to && subAgents.has(args.to)) return subAgents.get(args.to);
      } catch {
        // 参数可能还在流式构建中
      }
    }
    // 1c. 无结果的 agent 工具调用：优先匹配运行中的子代理，
    // 回退到已完成的（覆盖 sub-agent done → tool_call_complete 之间的间隙）
    if (!tc.result) {
      let completed: SubAgentState | undefined;
      for (const sa of subAgents.values()) {
        if (sa.isRunning) return sa;
        if (!completed) completed = sa;
      }
      if (completed) return completed;
    }
  }

  // 2. 回退到持久化的 subAgentDetails（页面刷新/加载后可用）
  if (tc.subAgentDetails) {
    const d = tc.subAgentDetails;
    return {
      agentId: d.agentId,
      description: d.description,
      subAgentType: d.subAgentType,
      completedMessages: d.messages,
      currentContent: "",
      currentThinking: "",
      currentToolCalls: [],
      isRunning: false,
      usage: d.usage,
    } satisfies SubAgentState;
  }

  return undefined;
}
