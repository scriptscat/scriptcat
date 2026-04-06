import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Message as ArcoMessage } from "@arco-design/web-react";
import { IconRobot } from "@arco-design/web-react/icon";
import type { AgentModelConfig, SkillSummary, ContentBlock, MessageContent } from "@App/app/service/agent/core/types";
import { AgentChatRepo } from "@App/app/repo/agent_chat";
import type { ChatMessage, ChatStreamEvent } from "@App/app/service/agent/core/types";
import { getTextContent } from "@App/app/service/agent/core/content_utils";
import { UserMessageItem, AssistantMessageGroup } from "./MessageItem";
import ChatInput from "./ChatInput";
import { useMessages, useStreamingChat, useConversationTasks, deleteMessages, clearMessages } from "./hooks";
import AskUserBlock from "./AskUserBlock";
import TaskListBlock from "./TaskListBlock";
import type { SubAgentState } from "./SubAgentBlock";
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

const chatRepo = new AgentChatRepo();

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
  modelsLoaded,
  selectedModelId,
  onModelChange,
  onConversationTitleChange,
  skills,
  selectedSkills,
  onSkillsChange,
  enableTools,
  onEnableToolsChange,
  runningIds,
  backgroundEnabled,
  onBackgroundEnabledChange,
}: {
  conversationId: string;
  models: AgentModelConfig[];
  modelsLoaded?: boolean;
  selectedModelId: string;
  onModelChange: (id: string) => void;
  onConversationTitleChange?: () => void;
  skills?: SkillSummary[];
  selectedSkills?: "auto" | string[];
  onSkillsChange?: (skills: "auto" | string[]) => void;
  enableTools?: boolean;
  onEnableToolsChange?: (enabled: boolean) => void;
  runningIds?: Set<string>;
  backgroundEnabled?: boolean;
  onBackgroundEnabledChange?: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const { messages, setMessages, loadMessages } = useMessages(conversationId);
  const {
    isStreaming,
    setIsStreaming,
    sendMessage,
    stopGeneration,
    askUserPending,
    respondToAskUser,
    attachToConversation,
  } = useStreamingChat();
  const { tasks, setTasks, handleTaskUpdate, loadTasks } = useConversationTasks(conversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMsgRef = useRef<ChatMessage | null>(null);
  // 计时相关
  const sendStartTimeRef = useRef<number>(0);
  const firstTokenRecordedRef = useRef<boolean>(false);
  const firstTokenMsRef = useRef<number | undefined>(undefined);

  // 待处理的用户消息（LLM 运行中排队）
  const pendingMessageRef = useRef<{ content: MessageContent; messageId: string } | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);

  // 会话切换时清除待处理消息
  useEffect(() => {
    pendingMessageRef.current = null;
    setPendingMessageId(null);
  }, [conversationId]);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 流式期间累积的非文本 blocks（content_block_complete 事件）
  const pendingBlocksRef = useRef<ContentBlock[]>([]);
  // 子代理状态跟踪（流式期间按 agentId 维护）
  const subAgentsRef = useRef<Map<string, SubAgentState>>(new Map());
  // 重试倒计时定时器
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 清除重试倒计时
  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // 创建流式事件回调（提取公共逻辑）
  const createStreamCallback = () => {
    pendingBlocksRef.current = [];
    subAgentsRef.current = new Map();
    clearRetryTimer();
    return (event: ChatStreamEvent) => {
      // 不依赖流式消息的事件优先处理
      if (event.type === "task_update") {
        handleTaskUpdate(event);
        return;
      }
      if (event.type === "compact_done") {
        loadMessages();
        return;
      }

      const msg = streamingMsgRef.current;
      if (!msg) return;

      // 子代理事件：扁平化路由（通过 subAgent 标识区分）
      if ("subAgent" in event && event.subAgent) {
        const { agentId, description, subAgentType } = event.subAgent;
        let sa = subAgentsRef.current.get(agentId);
        if (!sa) {
          sa = {
            agentId,
            description,
            subAgentType,
            completedMessages: [],
            currentContent: "",
            currentThinking: "",
            currentToolCalls: [],
            isRunning: true,
          };
          subAgentsRef.current.set(agentId, sa);
        }
        switch (event.type) {
          case "content_delta":
            sa.currentContent += event.delta;
            break;
          case "thinking_delta":
            sa.currentThinking += event.delta;
            break;
          case "tool_call_start":
            sa.currentToolCalls.push({ ...event.toolCall, status: "running" });
            break;
          case "tool_call_delta":
            if (sa.currentToolCalls.length) {
              sa.currentToolCalls[sa.currentToolCalls.length - 1].arguments += event.delta;
            }
            break;
          case "tool_call_complete": {
            const tc = sa.currentToolCalls.find((t) => t.id === event.id);
            if (tc) {
              tc.status = "completed";
              tc.result = event.result;
              tc.attachments = event.attachments;
            }
            break;
          }
          case "new_message":
            if (sa.currentContent || sa.currentThinking || sa.currentToolCalls.length > 0) {
              sa.completedMessages.push({
                content: sa.currentContent,
                thinking: sa.currentThinking || undefined,
                toolCalls: [...sa.currentToolCalls],
              });
            }
            sa.currentContent = "";
            sa.currentThinking = "";
            sa.currentToolCalls = [];
            break;
          case "retry":
            sa.retryInfo = { attempt: event.attempt, maxRetries: event.maxRetries, error: event.error };
            break;
          case "done":
            if (event.usage) {
              if (!sa.usage) sa.usage = { inputTokens: 0, outputTokens: 0 };
              sa.usage.inputTokens += event.usage.inputTokens;
              sa.usage.outputTokens += event.usage.outputTokens;
              sa.usage.cacheCreationInputTokens =
                (sa.usage.cacheCreationInputTokens || 0) + (event.usage.cacheCreationInputTokens || 0);
              sa.usage.cacheReadInputTokens =
                (sa.usage.cacheReadInputTokens || 0) + (event.usage.cacheReadInputTokens || 0);
            }
          // falls through
          case "error":
            sa.retryInfo = undefined;
            if (sa.currentContent || sa.currentThinking || sa.currentToolCalls.length > 0) {
              sa.completedMessages.push({
                content: sa.currentContent,
                thinking: sa.currentThinking || undefined,
                toolCalls: [...sa.currentToolCalls],
              });
              sa.currentContent = "";
              sa.currentThinking = "";
              sa.currentToolCalls = [];
            }
            sa.isRunning = false;
            break;
        }
        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((m) => m.id === msg.id);
          if (idx >= 0) updated[idx] = { ...msg };
          return updated;
        });
        return;
      }

      switch (event.type) {
        case "content_delta":
          if (!firstTokenRecordedRef.current) {
            firstTokenRecordedRef.current = true;
            firstTokenMsRef.current = Date.now() - sendStartTimeRef.current;
          }
          // 重试成功后清除重试错误提示和倒计时
          if (msg.error) {
            clearRetryTimer();
            msg.error = undefined;
          }
          // streaming 期间 content 始终为 string
          if (typeof msg.content === "string") {
            msg.content += event.delta;
          }
          break;
        case "thinking_delta":
          if (!msg.thinking) msg.thinking = { content: "" };
          msg.thinking.content += event.delta;
          break;
        case "tool_call_start":
          if (msg.error) {
            clearRetryTimer();
            msg.error = undefined;
          }
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
        case "ask_user":
          // ask_user 事件由 hook 层处理
          break;
        case "content_block_start":
          // 非文本 block 开始，暂不处理（等 complete 时处理）
          break;
        case "content_block_complete":
          // 非文本 block 完成，加入 pending 列表
          pendingBlocksRef.current.push(event.block);
          break;
        case "new_message": {
          // 在开始新消息前，合并 pending blocks 到当前消息
          if (pendingBlocksRef.current.length > 0) {
            const textContent = typeof msg.content === "string" ? msg.content : "";
            const blocks: ContentBlock[] = [];
            if (textContent) blocks.push({ type: "text", text: textContent });
            blocks.push(...pendingBlocksRef.current);
            msg.content = blocks;
            pendingBlocksRef.current = [];
          }

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
        case "sync":
          // 重连快照：从快照重建流式消息状态
          if (event.streamingMessage) {
            msg.content = event.streamingMessage.content;
            if (event.streamingMessage.thinking) {
              msg.thinking = { content: event.streamingMessage.thinking };
            }
            if (event.streamingMessage.toolCalls.length > 0) {
              msg.toolCalls = event.streamingMessage.toolCalls;
            }
          }
          if (event.tasks.length > 0) {
            setTasks(event.tasks);
          }
          break;
        case "retry": {
          clearRetryTimer();
          const retryDeadline = Date.now() + event.delayMs;
          const updateRetryMsg = () => {
            const remaining = Math.max(0, Math.ceil((retryDeadline - Date.now()) / 1000));
            msg.error = `${event.error}\n${t("agent_chat_retrying", { attempt: event.attempt, max: event.maxRetries })} (${remaining}s)`;
            setMessages((prev) => {
              const updated = [...prev];
              const idx = updated.findIndex((m) => m.id === msg.id);
              if (idx >= 0) updated[idx] = { ...msg };
              return updated;
            });
            if (remaining <= 0) clearRetryTimer();
          };
          updateRetryMsg();
          retryTimerRef.current = setInterval(updateRetryMsg, 1000);
          break;
        }
        case "system_warning":
          msg.warning = event.message;
          break;
        case "error":
          msg.error = event.message;
          break;
        case "done":
          if (event.usage) msg.usage = event.usage;
          if (event.durationMs != null) msg.durationMs = event.durationMs;
          if (firstTokenMsRef.current != null) msg.firstTokenMs = firstTokenMsRef.current;
          // 合并 pending blocks 到最终消息
          if (pendingBlocksRef.current.length > 0) {
            const textContent = typeof msg.content === "string" ? msg.content : "";
            const blocks: ContentBlock[] = [];
            if (textContent) blocks.push({ type: "text", text: textContent });
            blocks.push(...pendingBlocksRef.current);
            msg.content = blocks;
            pendingBlocksRef.current = [];
          }
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

  // 处理排队的用户消息
  const processPendingMessage = async () => {
    const pending = pendingMessageRef.current;
    if (!pending) return;
    pendingMessageRef.current = null;
    setPendingMessageId(null);
    const freshMsgs = await chatRepo.getMessages(conversationId);
    startStreamingRef.current(freshMsgs, pending.content);
  };

  const createDoneCallback = () => {
    return async () => {
      clearRetryTimer();
      streamingMsgRef.current = null;
      if (pendingMessageRef.current) {
        // 有排队消息：跳过 loadMessages 避免闪烁，直接处理
        onConversationTitleChange?.();
        await processPendingMessage();
      } else {
        await loadMessages();
        onConversationTitleChange?.();
      }
    };
  };

  // 初始化流式请求的公共逻辑
  const startStreaming = (baseMessages: ChatMessage[], content: MessageContent, skipUserMessage?: boolean) => {
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
    sendMessage(
      conversationId,
      content,
      createStreamCallback(),
      createDoneCallback(),
      selectedModelId,
      skipUserMessage,
      enableTools,
      { background: backgroundEnabled }
    );
  };

  // 用 ref 保存 startStreaming 的最新引用，避免 useCallback 闭包陈旧
  const startStreamingRef = useRef(startStreaming);
  startStreamingRef.current = startStreaming;

  // 自动附加到后台运行中的会话
  useEffect(() => {
    if (!conversationId || isStreaming) return;
    if (!runningIds?.has(conversationId)) return;

    // 创建一个临时的 assistant 消息用于显示流式内容
    const assistantMsg: ChatMessage = {
      id: genId(),
      conversationId,
      role: "assistant",
      content: "",
      modelId: selectedModelId,
      createtime: Date.now(),
    };
    streamingMsgRef.current = assistantMsg;
    setIsStreaming(true);

    // 先加载已持久化的消息
    loadMessages().then(() => {
      setMessages((prev) => [...prev, assistantMsg]);

      attachToConversation(conversationId, createStreamCallback(), createDoneCallback());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, runningIds]);

  // 发送消息（支持附件文件或已有消息列表用于重新回答）
  const handleSend = async (content: MessageContent, files?: Map<string, File>) => {
    if (!conversationId || !selectedModelId) return;

    // 处理 /new 命令：清空对话上下文及任务（流式中不允许）
    if (typeof content === "string" && content.trim() === "/new") {
      if (isStreaming) return;
      await clearMessages(conversationId);
      setMessages([]);
      loadTasks();
      return;
    }

    // 处理 /compact 命令：压缩对话历史（流式中不允许）
    if (typeof content === "string" && content.trim().startsWith("/compact")) {
      if (isStreaming) return;
      const instruction = content.trim().slice("/compact".length).trim();
      sendMessage(
        conversationId,
        "",
        (event) => {
          if (event.type === "compact_done") {
            // compact 完成后刷新消息列表
            loadMessages();
          }
        },
        () => {},
        selectedModelId,
        undefined,
        undefined,
        {
          compact: true,
          compactInstruction: instruction || undefined,
        }
      );
      return;
    }

    // 保存附件到 OPFS
    if (files && files.size > 0) {
      for (const [id, file] of files) {
        await chatRepo.saveAttachment(id, file);
      }
    }

    // LLM 运行中：排队等待空闲时处理
    if (isStreaming) {
      const msgId = genId();
      pendingMessageRef.current = { content, messageId: msgId };
      setPendingMessageId(msgId);
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          conversationId,
          role: "user" as const,
          content,
          createtime: Date.now(),
        },
      ]);
      return;
    }

    startStreaming(messages, content);
  };

  // 复制消息组的文本内容到剪贴板
  const handleCopy = useCallback(
    (groupMessages: ChatMessage[]) => {
      const text = groupMessages
        .map((m) => getTextContent(m.content))
        .filter(Boolean)
        .join("\n\n");
      navigator.clipboard.writeText(text).then(() => {
        ArcoMessage.success(t("agent_chat_copy_success"));
      });
    },
    [t]
  );

  // 清理任务（重试/编辑时调用）
  const clearTasks = useCallback(async () => {
    await chatRepo.saveTasks(conversationId, []);
    setTasks([]);
  }, [conversationId, setTasks]);

  // 重新回答：删除当前 assistant 消息组，用上一条用户消息重新请求
  const handleRegenerate = useCallback(
    async (groups: MessageGroup[], groupIndex: number) => {
      if (isStreaming) return;

      const action = computeRegenerateAction(groups, groupIndex, messages);
      if (!action) return;

      await deleteMessages(conversationId, action.idsToDelete);
      await clearTasks();
      setMessages(action.remainingMessages);

      // 通过 ref 调用最新的 startStreaming，避免闭包陈旧
      startStreamingRef.current(action.remainingMessages, action.userContent);
    },
    [conversationId, isStreaming, messages, setMessages, clearTasks]
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
      await clearTasks();

      setMessages(action.remainingMessages);

      // skipUserMessage=true：用户消息已在 remainingMessages 中，不需要重新创建
      startStreamingRef.current(action.remainingMessages, action.userContent, action.skipUserMessage);
    },
    [conversationId, isStreaming, messages, setMessages, clearTasks]
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
    async (messageId: string, content: MessageContent, files?: Map<string, File>) => {
      if (isStreaming) return;

      const action = computeEditAction(messageId, messages);
      if (!action) return;

      // 保存新附件到 OPFS
      if (files && files.size > 0) {
        for (const [id, file] of files) {
          await chatRepo.saveAttachment(id, file);
        }
      }

      await deleteMessages(conversationId, action.idsToDelete);
      await clearTasks();
      setMessages(action.remainingMessages);

      // 通过 ref 调用最新的 startStreaming
      startStreamingRef.current(action.remainingMessages, content);
    },
    [conversationId, isStreaming, messages, setMessages, clearTasks]
  );

  // 停止生成：重置流式状态，将未完成的 tool call 标记为 error，并重新加载持久化消息
  const handleStop = useCallback(async () => {
    clearRetryTimer();
    stopGeneration();
    streamingMsgRef.current = null;
    // 将仍处于 running 状态的 tool call 标记为 error，避免 spinner 一直转
    setMessages((prev) => {
      const needsUpdate = prev.some((m) => m.toolCalls?.some((tc) => tc.status === "running"));
      if (!needsUpdate) return prev;
      return prev.map((m) => {
        if (!m.toolCalls?.some((tc) => tc.status === "running")) return m;
        return {
          ...m,
          toolCalls: m.toolCalls!.map((tc) => (tc.status === "running" ? { ...tc, status: "error" as const } : tc)),
        };
      });
    });
    // 有待处理消息时，停止后自动发送
    if (pendingMessageRef.current) {
      processPendingMessage();
    } else {
      // 重新加载持久化消息，恢复到后端实际保存的状态
      loadMessages();
    }
  }, [clearRetryTimer, stopGeneration, setMessages, loadMessages, conversationId]);

  // 取消排队的用户消息
  const handleCancelPending = useCallback(() => {
    const pending = pendingMessageRef.current;
    if (!pending) return;
    const msgId = pending.messageId;
    pendingMessageRef.current = null;
    setPendingMessageId(null);
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  }, [setMessages]);

  // 兜底：连接断开但 done 回调未触发时，处理排队消息
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && pendingMessageRef.current) {
      processPendingMessage();
    }
    prevStreamingRef.current = isStreaming;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  // 只在模型加载完成后才判断是否无模型，避免加载中闪现提示
  const noModel = modelsLoaded === true && models.length === 0;
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
                  onEdit={(content, files) => handleEditMessage(group.message.id, content, files)}
                  onRegenerate={
                    findNextAssistantGroupIndex(messageGroups, groupIndex) != null ||
                    groupIndex === messageGroups.length - 1
                      ? () => handleRegenerateUserMessage(group.message.id)
                      : undefined
                  }
                  onCancel={pendingMessageId === group.message.id ? handleCancelPending : undefined}
                />
              ) : (
                <AssistantMessageGroup
                  key={group.messages[0].id}
                  messages={group.messages}
                  streamingId={isStreaming ? streamingMsgRef.current?.id : undefined}
                  isStreaming={isStreaming}
                  streamStartTime={sendStartTimeRef.current || undefined}
                  subAgents={subAgentsRef.current.size > 0 ? subAgentsRef.current : undefined}
                  onCopy={() => handleCopy(group.messages)}
                  onRegenerate={() => handleRegenerate(messageGroups, groupIndex)}
                  onDelete={() => handleDeleteRound(messageGroups, groupIndex)}
                />
              )
            )
          )}
          {askUserPending && (
            <AskUserBlock
              id={askUserPending.id}
              question={askUserPending.question}
              options={askUserPending.options}
              multiple={askUserPending.multiple}
              onRespond={respondToAskUser}
            />
          )}
          {tasks.length > 0 && <TaskListBlock tasks={tasks} />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <ChatInput
        models={models}
        selectedModelId={selectedModelId}
        onModelChange={onModelChange}
        onSend={handleSend}
        onStop={handleStop}
        isStreaming={isStreaming}
        disabled={noModel || !conversationId}
        skills={skills}
        selectedSkills={selectedSkills}
        onSkillsChange={onSkillsChange}
        enableTools={enableTools}
        onEnableToolsChange={onEnableToolsChange}
        backgroundEnabled={backgroundEnabled}
        onBackgroundEnabledChange={onBackgroundEnabledChange}
        hasPendingMessage={pendingMessageId !== null}
      />
      {noModel && (
        <div className="tw-text-center tw-text-xs tw-text-[var(--color-text-3)] tw-pb-2">
          {t("agent_chat_no_model")}
        </div>
      )}
    </div>
  );
}
