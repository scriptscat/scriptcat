import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";
import { Bot } from "lucide-react";
import type {
  AgentModelConfig,
  SkillSummary,
  ContentBlock,
  MessageContent,
  ChatMessage,
  ChatStreamEvent,
} from "@App/app/service/agent/core/types";
import { agentChatRepo } from "@App/app/repo/agent_chat";
import { getTextContent } from "@App/app/service/agent/core/content_utils";
import { UserMessageItem, AssistantMessageGroup } from "./MessageItem";
import ChatInput from "./ChatInput";
import { useMessages, useStreamingChat, useConversationTasks, deleteMessages, clearMessages } from "./hooks";
import AskUserBlock from "./AskUserBlock";
import TaskListBlock from "./TaskListBlock";
import type { SubAgentState } from "./types";
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
    <div data-testid="welcome-screen" className="flex flex-col items-center justify-center h-full py-20 select-none">
      <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 shadow-sm">
        <Bot className="size-8 text-primary" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2 mt-0">
        {hasConversation ? t("agent:chat_input_placeholder") : t("agent:chat_no_conversations")}
      </h2>
      <p className="text-sm text-muted-foreground mb-6 mt-0">
        {hasConversation ? t("agent:chat_welcome_hint") : t("agent:chat_welcome_start")}
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
  const sendStartTimeRef = useRef<number>(0);
  const firstTokenRecordedRef = useRef<boolean>(false);
  const firstTokenMsRef = useRef<number | undefined>(undefined);

  const pendingMessageRef = useRef<{ content: MessageContent; messageId: string } | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);

  useEffect(() => {
    pendingMessageRef.current = null;
    setPendingMessageId(null);
  }, [conversationId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const pendingBlocksRef = useRef<ContentBlock[]>([]);
  const subAgentsRef = useRef<Map<string, SubAgentState>>(new Map());
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // 创建流式事件回调
  const createStreamCallback = () => {
    pendingBlocksRef.current = [];
    subAgentsRef.current = new Map();
    clearRetryTimer();
    return (event: ChatStreamEvent) => {
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

      // 子代理事件：扁平化路由
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
          case "tool_call_delta": {
            if (!sa.currentToolCalls.length) break;
            let tc = event.id ? sa.currentToolCalls.find((x) => x.id === event.id) : undefined;
            if (!tc && event.index !== undefined) tc = sa.currentToolCalls[event.index];
            if (!tc) {
              for (let i = sa.currentToolCalls.length - 1; i >= 0; i--) {
                if (sa.currentToolCalls[i].status === "running") {
                  tc = sa.currentToolCalls[i];
                  break;
                }
              }
            }
            if (tc) tc.arguments += event.delta;
            break;
          }
          case "tool_call_complete": {
            const tc = sa.currentToolCalls.find((x) => x.id === event.id);
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
          if (msg.error) {
            clearRetryTimer();
            msg.error = undefined;
          }
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
        case "tool_call_delta": {
          if (!msg.toolCalls?.length) break;
          let tc = event.id ? msg.toolCalls.find((x) => x.id === event.id) : undefined;
          if (!tc && event.index !== undefined) tc = msg.toolCalls[event.index];
          if (!tc) {
            for (let i = msg.toolCalls.length - 1; i >= 0; i--) {
              if (msg.toolCalls[i].status === "running") {
                tc = msg.toolCalls[i];
                break;
              }
            }
          }
          if (tc) tc.arguments += event.delta;
          break;
        }
        case "tool_call_complete": {
          const tc = msg.toolCalls?.find((x) => x.id === event.id);
          if (tc) {
            tc.status = "completed";
            tc.result = event.result;
            tc.attachments = event.attachments;
          }
          break;
        }
        case "ask_user":
          break;
        case "content_block_start":
          break;
        case "content_block_complete":
          pendingBlocksRef.current.push(event.block);
          break;
        case "new_message": {
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
            msg.error = `${event.error}\n${t("agent:chat_retrying", { attempt: event.attempt, max: event.maxRetries })} (${remaining}s)`;
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

  const processPendingMessage = async () => {
    const pending = pendingMessageRef.current;
    if (!pending) return;
    pendingMessageRef.current = null;
    setPendingMessageId(null);
    const freshMsgs = await agentChatRepo.getMessages(conversationId);
    startStreamingRef.current(freshMsgs, pending.content);
  };

  const createDoneCallback = () => {
    return async () => {
      clearRetryTimer();
      streamingMsgRef.current = null;
      if (pendingMessageRef.current) {
        onConversationTitleChange?.();
        await processPendingMessage();
      } else {
        await loadMessages();
        onConversationTitleChange?.();
      }
    };
  };

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

  const startStreamingRef = useRef(startStreaming);
  startStreamingRef.current = startStreaming;

  // 自动附加到后台运行中的会话
  useEffect(() => {
    if (!conversationId || isStreaming) return;
    if (!runningIds?.has(conversationId)) return;

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

    loadMessages().then(() => {
      setMessages((prev) => [...prev, assistantMsg]);
      attachToConversation(conversationId, createStreamCallback(), createDoneCallback());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, runningIds]);

  const handleSend = async (content: MessageContent, files?: Map<string, File>) => {
    if (!conversationId || !selectedModelId) return;

    // /new：清空对话上下文及任务
    if (typeof content === "string" && content.trim() === "/new") {
      if (isStreaming) return;
      await clearMessages(conversationId);
      setMessages([]);
      loadTasks();
      return;
    }

    // /compact：压缩对话历史
    if (typeof content === "string" && content.trim().startsWith("/compact")) {
      if (isStreaming) return;
      const instruction = content.trim().slice("/compact".length).trim();
      sendMessage(
        conversationId,
        "",
        (event) => {
          if (event.type === "compact_done") {
            loadMessages();
          }
        },
        () => {},
        selectedModelId,
        undefined,
        undefined,
        { compact: true, compactInstruction: instruction || undefined }
      );
      return;
    }

    // 保存附件到 OPFS
    if (files && files.size > 0) {
      for (const [id, file] of files) {
        await agentChatRepo.saveAttachment(id, file);
      }
    }

    // LLM 运行中：排队
    if (isStreaming) {
      const msgId = genId();
      pendingMessageRef.current = { content, messageId: msgId };
      setPendingMessageId(msgId);
      setMessages((prev) => [
        ...prev,
        { id: msgId, conversationId, role: "user" as const, content, createtime: Date.now() },
      ]);
      return;
    }

    startStreaming(messages, content);
  };

  const handleCopy = useCallback(
    (groupMsgs: ChatMessage[]) => {
      const text = groupMsgs
        .map((m) => getTextContent(m.content))
        .filter(Boolean)
        .join("\n\n");
      navigator.clipboard.writeText(text).then(() => {
        notify.success(t("agent:chat_copy_success"));
      });
    },
    [t]
  );

  const clearTasks = useCallback(async () => {
    await agentChatRepo.saveTasks(conversationId, []);
    setTasks([]);
  }, [conversationId, setTasks]);

  const handleRegenerate = useCallback(
    async (groups: MessageGroup[], groupIndex: number) => {
      if (isStreaming) return;
      const action = computeRegenerateAction(groups, groupIndex, messages);
      if (!action) return;
      await deleteMessages(conversationId, action.idsToDelete);
      await clearTasks();
      setMessages(action.remainingMessages);
      startStreamingRef.current(action.remainingMessages, action.userContent);
    },
    [conversationId, isStreaming, messages, setMessages, clearTasks]
  );

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
      startStreamingRef.current(action.remainingMessages, action.userContent, action.skipUserMessage);
    },
    [conversationId, isStreaming, messages, setMessages, clearTasks]
  );

  const handleDeleteRound = useCallback(
    async (groups: MessageGroup[], groupIndex: number) => {
      if (isStreaming) return;
      const group = groups[groupIndex];
      if (group.type !== "assistant") return;

      const idsToDelete: string[] = group.messages.map((m) => m.id);
      for (let i = groupIndex - 1; i >= 0; i--) {
        if (groups[i].type === "user") {
          idsToDelete.push((groups[i] as { type: "user"; message: ChatMessage }).message.id);
          break;
        }
      }

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

  const handleEditMessage = useCallback(
    async (messageId: string, content: MessageContent, files?: Map<string, File>) => {
      if (isStreaming) return;
      const action = computeEditAction(messageId, messages);
      if (!action) return;
      if (files && files.size > 0) {
        for (const [id, file] of files) {
          await agentChatRepo.saveAttachment(id, file);
        }
      }
      await deleteMessages(conversationId, action.idsToDelete);
      await clearTasks();
      setMessages(action.remainingMessages);
      startStreamingRef.current(action.remainingMessages, content);
    },
    [conversationId, isStreaming, messages, setMessages, clearTasks]
  );

  const handleStop = useCallback(async () => {
    clearRetryTimer();
    stopGeneration();
    streamingMsgRef.current = null;
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
    if (pendingMessageRef.current) {
      processPendingMessage();
    } else {
      loadMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearRetryTimer, stopGeneration, setMessages, loadMessages]);

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

  const noModel = modelsLoaded === true && models.length === 0;
  const showWelcome = !conversationId || (messages.length === 0 && !isStreaming);
  const mergedMessages = mergeToolResults(messages);
  const messageGroups = groupMessages(mergedMessages);

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full bg-background">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="max-w-3xl mx-auto">
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
        <div data-testid="no-model-hint" className="text-center text-xs text-muted-foreground pb-2">
          {t("agent:chat_no_model")}
        </div>
      )}
    </div>
  );
}
