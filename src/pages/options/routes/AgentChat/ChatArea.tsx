import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Message as ArcoMessage } from "@arco-design/web-react";
import { IconRobot } from "@arco-design/web-react/icon";
import type { AgentModelConfig, SkillSummary } from "@App/app/service/agent/types";
import type { ChatMessage, ChatStreamEvent } from "@App/app/service/agent/types";
import { UserMessageItem, AssistantMessageGroup } from "./MessageItem";
import ChatInput from "./ChatInput";
import { useMessages, useStreamingChat, deleteMessages, clearMessages } from "./hooks";
import {
  mergeToolResults,
  groupMessages,
  computeRegenerateAction,
  computeEditAction,
  computeUserRegenerateAction,
  findNextAssistantGroupIndex,
  type MessageGroup,
} from "./chat_utils";

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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

  // 创建流式事件回调（提取公共逻辑）
  const createStreamCallback = () => {
    return (event: ChatStreamEvent) => {
      const msg = streamingMsgRef.current;
      if (!msg) return;

      switch (event.type) {
        case "content_delta":
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
            tc.attachments = event.attachments;
          }
          break;
        }
        case "new_message": {
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
          return;
        }
        case "error":
          msg.error = event.message;
          break;
        case "done":
          if (event.usage) msg.usage = event.usage;
          if (event.durationMs != null) msg.durationMs = event.durationMs;
          if (firstTokenMsRef.current != null) msg.firstTokenMs = firstTokenMsRef.current;
          break;
      }

      setMessages((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex((m) => m.id === msg.id);
        if (idx >= 0) {
          updated[idx] = { ...msg };
        }
        return updated;
      });
    };
  };

  const createDoneCallback = () => {
    return async () => {
      streamingMsgRef.current = null;
      await loadMessages();
      onConversationTitleChange?.();
    };
  };

  // 初始化流式请求的公共逻辑
  const startStreaming = (baseMessages: ChatMessage[], content: string, skipUserMessage?: boolean) => {
    sendStartTimeRef.current = Date.now();
    firstTokenRecordedRef.current = false;
    firstTokenMsRef.current = undefined;

    const newMessages = [...baseMessages];
    if (!skipUserMessage) {
      newMessages.push({
        id: genId(),
        conversationId,
        role: "user",
        content,
        createtime: Date.now(),
      });
    }

    const assistantMsg: ChatMessage = {
      id: genId(),
      conversationId,
      role: "assistant",
      content: "",
      modelId: selectedModelId,
      createtime: Date.now(),
    };
    streamingMsgRef.current = assistantMsg;
    newMessages.push(assistantMsg);

    setMessages(newMessages);
    sendMessage(conversationId, content, createStreamCallback(), createDoneCallback(), selectedModelId);
  };

  // 用 ref 保存 startStreaming 的最新引用，避免 useCallback 闭包陈旧
  const startStreamingRef = useRef(startStreaming);
  startStreamingRef.current = startStreaming;

  // 发送消息（支持指定 content 和可选的已有消息列表用于重新回答）
  const handleSend = async (content: string, existingMessages?: ChatMessage[]) => {
    if (!conversationId || !selectedModelId) return;

    // 处理 /new 命令：清空对话上下文
    if (content.trim() === "/new") {
      await clearMessages(conversationId);
      setMessages([]);
      return;
    }

    startStreaming(existingMessages ?? messages, content);
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

      const action = computeRegenerateAction(groups, groupIndex, messages);
      if (!action) return;

      await deleteMessages(conversationId, action.idsToDelete);
      setMessages(action.remainingMessages);

      // 通过 ref 调用最新的 startStreaming，避免闭包陈旧
      startStreamingRef.current(action.remainingMessages, action.userContent);
    },
    [conversationId, isStreaming, messages, setMessages]
  );

  // 重新生成用户消息的回复：保留用户消息，只删除后续回复
  const handleRegenerateUserMessage = useCallback(
    async (messageId: string) => {
      if (isStreaming) return;

      const action = computeUserRegenerateAction(messageId, messages);
      if (!action) return;

      if (action.idsToDelete.length > 0) {
        await deleteMessages(conversationId, action.idsToDelete);
      }

      setMessages(action.remainingMessages);

      // skipUserMessage=true：用户消息已在 remainingMessages 中，不需要重新创建
      startStreamingRef.current(action.remainingMessages, action.userContent, action.skipUserMessage);
    },
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

  // 编辑用户消息并重新发送：删除该消息及其后的所有消息
  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (isStreaming) return;

      const action = computeEditAction(messageId, messages);
      if (!action) return;

      await deleteMessages(conversationId, action.idsToDelete);
      setMessages(action.remainingMessages);

      // 通过 ref 调用最新的 startStreaming
      startStreamingRef.current(action.remainingMessages, newContent);
    },
    [conversationId, isStreaming, messages, setMessages]
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
                <UserMessageItem
                  key={group.message.id}
                  message={group.message}
                  isStreaming={isStreaming}
                  onEdit={(newContent) => handleEditMessage(group.message.id, newContent)}
                  onRegenerate={
                    findNextAssistantGroupIndex(messageGroups, groupIndex) != null
                      ? () => handleRegenerateUserMessage(group.message.id)
                      : undefined
                  }
                />
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
