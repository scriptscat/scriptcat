import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Message as ArcoMessage } from "@arco-design/web-react";
import { IconRobot } from "@arco-design/web-react/icon";
import type { AgentModelConfig, SkillSummary } from "@App/app/service/agent/types";
import type { ChatMessage, ChatStreamEvent } from "@App/app/service/agent/types";
import { UserMessageItem, AssistantMessageGroup } from "./MessageItem";
import ChatInput from "./ChatInput";
import { useMessages, useStreamingChat, deleteMessages, clearMessages } from "./hooks";

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 将 tool 角色消息的结果合并到 assistant 消息的 toolCalls 中，并过滤掉 tool/system 消息
function mergeToolResults(messages: ChatMessage[]): ChatMessage[] {
  // 建立 toolCallId → tool 消息内容 的映射
  const toolResultMap = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === "tool" && msg.toolCallId) {
      toolResultMap.set(msg.toolCallId, msg.content);
    }
  }

  // 合并 tool 结果到 assistant 的 toolCalls，并过滤不需要展示的消息
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

// 将消息按角色分组：连续的 assistant 消息合并为一组
type MessageGroup = { type: "user"; message: ChatMessage } | { type: "assistant"; messages: ChatMessage[] };

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      groups.push({ type: "user", message: msg });
    } else {
      // assistant 消息，尝试合并到上一个 assistant 组
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

// 欢迎界面
function WelcomeScreen({ hasConversation }: { hasConversation: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-h-full tw-py-20 tw-select-none">
      <div className="tw-w-16 tw-h-16 tw-rounded-2xl tw-bg-gradient-to-br tw-from-[rgb(var(--arcoblue-1))] tw-to-[rgb(var(--arcoblue-2))] tw-flex tw-items-center tw-justify-center tw-mb-5 tw-shadow-sm">
        <IconRobot style={{ fontSize: 32, color: "rgb(var(--arcoblue-6))" }} />
      </div>
      <h2 className="tw-text-lg tw-font-semibold tw-text-[var(--color-text-1)] tw-mb-2 tw-mt-0">
        {hasConversation ? t("agent_chat_input_placeholder") : t("agent_chat_no_conversations")}
      </h2>
      <p className="tw-text-sm tw-text-[var(--color-text-3)] tw-mb-6 tw-mt-0">
        {hasConversation
          ? t("agent_chat_welcome_hint") || "Ask me anything about your scripts"
          : t("agent_chat_welcome_start") || "Create a conversation to get started"}
      </p>
    </div>
  );
}

export default function ChatArea({
  conversationId,
  models,
  selectedModelId,
  onModelChange,
  onConversationTitleChange,
  skills,
  selectedSkills,
  onSkillsChange,
}: {
  conversationId: string;
  models: AgentModelConfig[];
  selectedModelId: string;
  onModelChange: (id: string) => void;
  onConversationTitleChange?: () => void;
  skills?: SkillSummary[];
  selectedSkills?: "auto" | string[];
  onSkillsChange?: (skills: "auto" | string[]) => void;
}) {
  const { t } = useTranslation();
  const { messages, setMessages, loadMessages } = useMessages(conversationId);
  const { isStreaming, sendMessage, stopGeneration } = useStreamingChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMsgRef = useRef<ChatMessage | null>(null);
  // 计时相关
  const sendStartTimeRef = useRef<number>(0);
  const firstTokenRecordedRef = useRef<boolean>(false);
  const firstTokenMsRef = useRef<number | undefined>(undefined);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 发送消息（支持指定 content 和可选的已有消息列表用于重新回答）
  const handleSend = async (content: string, existingMessages?: ChatMessage[]) => {
    if (!conversationId || !selectedModelId) return;

    // 处理 /new 命令：清空对话上下文
    if (content.trim() === "/new") {
      await clearMessages(conversationId);
      setMessages([]);
      return;
    }

    // 记录发送开始时间
    sendStartTimeRef.current = Date.now();
    firstTokenRecordedRef.current = false;
    firstTokenMsRef.current = undefined;

    // 乐观 UI 更新：添加用户消息和助手消息占位
    const userMsg: ChatMessage = {
      id: genId(),
      conversationId,
      role: "user",
      content,
      createtime: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: genId(),
      conversationId,
      role: "assistant",
      content: "",
      modelId: selectedModelId,
      createtime: Date.now(),
    };
    streamingMsgRef.current = assistantMsg;

    const baseMessages = existingMessages ?? messages;
    setMessages([...baseMessages, userMsg, assistantMsg]);

    // SW 负责持久化和自动标题，UI 只需传 conversationId + message + modelId
    sendMessage(
      conversationId,
      content,
      (event: ChatStreamEvent) => {
        const msg = streamingMsgRef.current;
        if (!msg) return;

        switch (event.type) {
          case "content_delta":
            // 记录首 token 延迟
            if (!firstTokenRecordedRef.current) {
              firstTokenRecordedRef.current = true;
              firstTokenMsRef.current = Date.now() - sendStartTimeRef.current;
            }
            msg.content += event.delta;
            break;
          case "thinking_delta":
            if (!msg.thinking) msg.thinking = { content: "" };
            msg.thinking.content += event.delta;
            break;
          case "tool_call_start":
            if (!msg.toolCalls) msg.toolCalls = [];
            msg.toolCalls.push({ ...event.toolCall, status: "running" });
            break;
          case "tool_call_delta":
            if (msg.toolCalls?.length) {
              const lastTc = msg.toolCalls[msg.toolCalls.length - 1];
              lastTc.arguments += event.delta;
            }
            break;
          case "tool_call_complete": {
            const tc = msg.toolCalls?.find((t) => t.id === event.id);
            if (tc) {
              tc.status = "completed";
              tc.result = event.result;
            }
            break;
          }
          case "new_message": {
            // 工具执行完成后开始新一轮 LLM 调用，创建新的 assistant 消息占位
            const newMsg: ChatMessage = {
              id: genId(),
              conversationId,
              role: "assistant",
              content: "",
              modelId: selectedModelId,
              createtime: Date.now(),
            };
            streamingMsgRef.current = newMsg;
            setMessages((prev) => [...prev, newMsg]);
            return; // 已经更新了 messages，直接返回避免下方重复 setMessages
          }
          case "error":
            msg.error = event.message;
            break;
          case "done":
            // 写入元数据
            if (event.usage) msg.usage = event.usage;
            if (event.durationMs != null) msg.durationMs = event.durationMs;
            if (firstTokenMsRef.current != null) msg.firstTokenMs = firstTokenMsRef.current;
            break;
        }

        // 更新 UI（创建新引用触发重渲染）
        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((m) => m.id === msg.id);
          if (idx >= 0) {
            updated[idx] = { ...msg };
          }
          return updated;
        });
      },
      async () => {
        streamingMsgRef.current = null;
        // 重新加载 SW 持久化的消息，确保一致性
        await loadMessages();
        // 通知标题可能已变更（SW 自动标题）
        onConversationTitleChange?.();
      },
      selectedModelId
    );
  };

  // 复制消息组的文本内容到剪贴板
  const handleCopy = useCallback(
    (groupMessages: ChatMessage[]) => {
      const text = groupMessages
        .map((m) => m.content)
        .filter(Boolean)
        .join("\n\n");
      navigator.clipboard.writeText(text).then(() => {
        ArcoMessage.success(t("agent_chat_copy_success"));
      });
    },
    [t]
  );

  // 重新回答：删除当前 assistant 消息组，用上一条用户消息重新请求
  const handleRegenerate = useCallback(
    async (groups: MessageGroup[], groupIndex: number) => {
      if (isStreaming) return;

      // 找到对应的 assistant 组
      const group = groups[groupIndex];
      if (group.type !== "assistant") return;

      // 找到前面的用户消息
      let userMessage: ChatMessage | null = null;
      for (let i = groupIndex - 1; i >= 0; i--) {
        if (groups[i].type === "user") {
          userMessage = (groups[i] as { type: "user"; message: ChatMessage }).message;
          break;
        }
      }
      if (!userMessage) return;

      // 收集需要删除的消息 ID（assistant 组 + 关联的 tool 消息）
      const idsToDelete = group.messages.map((m) => m.id);
      // 同时删除用户消息（会重新创建）
      idsToDelete.push(userMessage.id);

      // 从持久化存储中删除
      await deleteMessages(conversationId, idsToDelete);

      // 重建消息列表（不包含被删除的消息）
      const idSet = new Set(idsToDelete);
      const remainingMessages = messages.filter((m) => !idSet.has(m.id));
      setMessages(remainingMessages);

      // 用原来的用户消息内容重新请求
      await handleSend(userMessage.content, remainingMessages);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId, isStreaming, messages, setMessages]
  );

  // 删除整轮对话（用户消息 + assistant 消息组）
  const handleDeleteRound = useCallback(
    async (groups: MessageGroup[], groupIndex: number) => {
      if (isStreaming) return;

      const group = groups[groupIndex];
      if (group.type !== "assistant") return;

      const idsToDelete: string[] = group.messages.map((m) => m.id);

      // 找到前面的用户消息
      for (let i = groupIndex - 1; i >= 0; i--) {
        if (groups[i].type === "user") {
          idsToDelete.push((groups[i] as { type: "user"; message: ChatMessage }).message.id);
          break;
        }
      }

      // 从持久化存储中删除（这里要删除原始消息，包括 tool 角色消息）
      // 先根据 assistant 消息的 toolCalls 找出关联的 tool 消息
      const allToolCallIds = group.messages.flatMap((m) => m.toolCalls?.map((tc) => tc.id) || []);
      const originalToolMsgIds = messages
        .filter((m) => m.role === "tool" && m.toolCallId && allToolCallIds.includes(m.toolCallId))
        .map((m) => m.id);
      idsToDelete.push(...originalToolMsgIds);

      await deleteMessages(conversationId, idsToDelete);
      loadMessages();
    },
    [conversationId, isStreaming, messages, loadMessages]
  );

  const noModel = models.length === 0;
  const showWelcome = !conversationId || (messages.length === 0 && !isStreaming);
  const mergedMessages = mergeToolResults(messages);
  const messageGroups = groupMessages(mergedMessages);

  return (
    <div className="tw-flex tw-flex-col tw-flex-1 tw-min-w-0 tw-h-full tw-bg-[var(--color-bg-1)]">
      {/* 消息列表 */}
      <div className="tw-flex-1 tw-overflow-y-auto tw-px-4 agent-chat-scroll">
        <div className="tw-max-w-3xl tw-mx-auto">
          {showWelcome ? (
            <WelcomeScreen hasConversation={!!conversationId} />
          ) : (
            messageGroups.map((group, groupIndex) =>
              group.type === "user" ? (
                <UserMessageItem key={group.message.id} message={group.message} />
              ) : (
                <AssistantMessageGroup
                  key={group.messages[0].id}
                  messages={group.messages}
                  streamingId={isStreaming ? streamingMsgRef.current?.id : undefined}
                  isStreaming={isStreaming}
                  streamStartTime={sendStartTimeRef.current || undefined}
                  onCopy={() => handleCopy(group.messages)}
                  onRegenerate={() => handleRegenerate(messageGroups, groupIndex)}
                  onDelete={() => handleDeleteRound(messageGroups, groupIndex)}
                />
              )
            )
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <ChatInput
        models={models}
        selectedModelId={selectedModelId}
        onModelChange={onModelChange}
        onSend={handleSend}
        onStop={stopGeneration}
        isStreaming={isStreaming}
        disabled={noModel || !conversationId}
        skills={skills}
        selectedSkills={selectedSkills}
        onSkillsChange={onSkillsChange}
      />
      {noModel && (
        <div className="tw-text-center tw-text-xs tw-text-[var(--color-text-3)] tw-pb-2">
          {t("agent_chat_no_model")}
        </div>
      )}
    </div>
  );
}
