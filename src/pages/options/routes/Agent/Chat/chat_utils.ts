import type { ChatMessage, MessageContent, SubAgentDetails } from "@App/app/service/agent/core/types";
import type { SubAgentState } from "./types";

/** 消息分组：连续的 assistant 消息合并为一组，user 单独成组 */
export type MessageGroup = { type: "user"; message: ChatMessage } | { type: "assistant"; messages: ChatMessage[] };

/** 将 tool 角色消息的结果合并进 assistant 的 toolCalls，并过滤掉 tool/system 消息 */
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
            // 存在对应的 tool 结果消息即证明工具已结束。"running" 是过期状态
            // （如 SW 在回写 completed 前被终止/中断），必须纠正为 "completed"，
            // 否则刷新/重载后工具图标会一直转圈。其它状态（error）保留。
            const status = !tc.status || tc.status === "running" ? "completed" : tc.status;
            return { ...tc, result, status };
          }
          return tc;
        });
        return { ...msg, toolCalls: updatedToolCalls };
      }
      return msg;
    });
}

/** 按角色把消息分组：连续的 assistant 合并为一组 */
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

/**
 * 计算「重新生成」需要删除的消息与保留的消息。
 * 输入 assistant 组索引；删除该 assistant 组与其前一条用户消息（由 handleSend 重新创建）。
 */
export function computeRegenerateAction(
  groups: MessageGroup[],
  assistantGroupIndex: number,
  allMessages: ChatMessage[]
): { idsToDelete: string[]; remainingMessages: ChatMessage[]; userContent: MessageContent } | null {
  const group = groups[assistantGroupIndex];
  if (!group || group.type !== "assistant") return null;

  // 向前找到对应的用户消息
  let userMessage: ChatMessage | null = null;
  for (let i = assistantGroupIndex - 1; i >= 0; i--) {
    const g = groups[i];
    if (g.type === "user") {
      userMessage = g.message;
      break;
    }
  }
  if (!userMessage) return null;

  const idsToDelete = group.messages.map((m) => m.id);
  idsToDelete.push(userMessage.id);

  // group.messages 来自 mergeToolResults 过滤后的视图，不含 tool 角色消息。
  // 必须把该组 assistant 工具调用对应的 tool 结果消息一并删除，
  // 否则存储中残留孤立 tool_result，重新生成时会混入 LLM 上下文（无配对的 tool_use）。
  const groupToolCallIds = new Set(group.messages.flatMap((m) => m.toolCalls?.map((tc) => tc.id) || []));
  for (const m of allMessages) {
    if (m.role === "tool" && m.toolCallId && groupToolCallIds.has(m.toolCallId)) {
      idsToDelete.push(m.id);
    }
  }

  const idSet = new Set(idsToDelete);
  const remainingMessages = allMessages.filter((m) => !idSet.has(m.id));

  return { idsToDelete, remainingMessages, userContent: userMessage.content };
}

/** 计算「编辑用户消息」需要删除的消息（该消息及其后全部）与保留的消息 */
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

/** 用户消息位于 groups 的 userGroupIndex，返回紧跟其后的 assistant 组索引 */
export function findNextAssistantGroupIndex(groups: MessageGroup[], userGroupIndex: number): number | null {
  if (userGroupIndex + 1 < groups.length && groups[userGroupIndex + 1].type === "assistant") {
    return userGroupIndex + 1;
  }
  return null;
}

/**
 * 计算「用户消息重新生成」：保留用户消息本身，只删除其后的回复。
 * skipUserMessage 为 true，避免 startStreaming 重复创建用户消息。
 */
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
  const idsToDelete = allMessages.slice(idx + 1).map((m) => m.id);
  const remainingMessages = allMessages.slice(0, idx + 1);

  return { idsToDelete, remainingMessages, userContent, skipUserMessage: true };
}

/** 匹配 agent 工具调用对应的子代理状态（流式 map 优先，回退到持久化 subAgentDetails） */
export function getSubAgentForToolCall(
  tc: { name: string; result?: string; arguments?: string; subAgentDetails?: SubAgentDetails },
  subAgents?: Map<string, SubAgentState>
): SubAgentState | undefined {
  if (tc.name !== "agent") return undefined;

  if (subAgents) {
    // 1a. 从已完成结果匹配（格式: "[agentId: xxx]\n\n..."）
    if (tc.result) {
      const match = tc.result.match(/^\[agentId: ([^\]]+)\]/);
      if (match) {
        const sa = subAgents.get(match[1]);
        if (sa) return sa;
      }
    }
    // 1b. 从参数 to 字段匹配（resume 场景）
    if (tc.arguments) {
      try {
        const args = JSON.parse(tc.arguments);
        if (args.to && subAgents.has(args.to)) return subAgents.get(args.to);
      } catch {
        // 参数可能仍在流式构建中
      }
    }
    // 1c. 无结果时：优先运行中的子代理，回退到已完成的
    // （覆盖 sub-agent done → tool_call_complete 之间的间隙）
    if (!tc.result) {
      let completed: SubAgentState | undefined;
      for (const sa of subAgents.values()) {
        if (sa.isRunning) return sa;
        if (!completed) completed = sa;
      }
      if (completed) return completed;
    }
  }

  // 2. 回退到持久化 subAgentDetails（刷新/加载后可用）
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
