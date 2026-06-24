import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  Conversation,
  ChatMessage,
  ChatStreamEvent,
  SkillSummary,
  MessageContent,
} from "@App/app/service/agent/core/types";
import type { Task } from "@App/app/service/agent/core/tools/task_tools";
import { AgentChatRepo } from "@App/app/repo/agent_chat";
import { SkillRepo } from "@App/app/repo/skill_repo";
import { message as extensionMessage } from "@App/pages/store/global";
import { connect, sendMessage as sendMsg } from "@Packages/message/client";
import type { MessageConnect } from "@Packages/message/types";

const repo = new AgentChatRepo();
const skillRepo = new SkillRepo();

// 生成唯一 ID
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 会话管理 hook
export function useConversations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  // 从 URL 参数读取当前会话 ID
  const activeId = searchParams.get("id") || "";

  // 设置会话 ID 并同步到 URL
  const setActiveId = useCallback(
    (id: string) => {
      setSearchParams(id ? { id } : {}, { replace: true });
    },
    [setSearchParams]
  );

  // 加载会话列表
  const loadConversations = useCallback(async () => {
    const list = await repo.listConversations();
    setConversations(list);
    return list;
  }, []);

  useEffect(() => {
    loadConversations().then((list) => {
      if (list.length > 0 && !activeId) {
        // 进入页面时，如果有会话且 URL 中无 id 参数，则自动选中第一个
        setActiveId(list[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadConversations]);

  // 创建新会话
  const createConversation = useCallback(
    async (modelId: string, skills?: "auto" | string[]) => {
      const conv: Conversation = {
        id: genId(),
        title: "New Chat",
        modelId,
        skills,
        createtime: Date.now(),
        updatetime: Date.now(),
      };
      await repo.saveConversation(conv);
      const list = await loadConversations();
      setActiveId(conv.id);
      return { conv, list };
    },
    [loadConversations, setActiveId]
  );

  // 删除会话
  const deleteConversation = useCallback(
    async (id: string) => {
      await repo.deleteConversation(id);
      const list = await loadConversations();
      if (activeId === id) {
        setActiveId(list[0]?.id || "");
      }
    },
    [activeId, loadConversations, setActiveId]
  );

  // 重命名会话
  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const list = await repo.listConversations();
      const conv = list.find((c) => c.id === id);
      if (conv) {
        conv.title = title;
        conv.updatetime = Date.now();
        await repo.saveConversation(conv);
        await loadConversations();
      }
    },
    [loadConversations]
  );

  return {
    conversations,
    activeId,
    setActiveId,
    createConversation,
    deleteConversation,
    renameConversation,
    loadConversations,
  };
}

// 消息管理 hook
export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    const msgs = await repo.getMessages(conversationId);
    setMessages(msgs);
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  return { messages, setMessages, loadMessages };
}

// ask_user 待回复状态
export type AskUserPending = { id: string; question: string; options?: string[]; multiple?: boolean };

// 流式聊天 hook
export function useStreamingChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [askUserPending, setAskUserPending] = useState<AskUserPending | null>(null);
  const connRef = useRef<MessageConnect | null>(null);
  const abortedRef = useRef(false);

  const stopGeneration = useCallback(() => {
    abortedRef.current = true;
    const conn = connRef.current;
    connRef.current = null;
    // 先确保 UI 状态重置，再断开连接（避免 sendMessage/disconnect 抛异常导致状态卡住）
    setIsStreaming(false);
    setAskUserPending(null);
    if (conn) {
      try {
        conn.sendMessage({ action: "stop" });
      } catch {
        // port 可能已断开
      }
      try {
        conn.disconnect();
      } catch {
        // port 可能已断开
      }
    }
  }, []);

  // 回复 ask_user 提问
  const respondToAskUser = useCallback((id: string, answer: string) => {
    if (connRef.current) {
      connRef.current.sendMessage({ action: "askUserResponse", data: { id, answer } });
    }
    setAskUserPending(null);
  }, []);

  const sendMessage = useCallback(
    async (
      conversationId: string,
      message: MessageContent,
      onEvent: (event: ChatStreamEvent) => void,
      onDone: () => void,
      modelId?: string,
      skipSaveUserMessage?: boolean,
      enableTools?: boolean,
      extra?: { compact?: boolean; compactInstruction?: string; background?: boolean }
    ) => {
      setIsStreaming(true);
      abortedRef.current = false;
      setAskUserPending(null);

      try {
        const conn = await connect(extensionMessage, "serviceWorker/agent/conversationChat", {
          conversationId,
          message,
          modelId,
          skipSaveUserMessage,
          enableTools,
          ...extra,
        });

        connRef.current = conn;

        conn.onMessage((msg) => {
          if (abortedRef.current) return;
          const event = msg.data as ChatStreamEvent;
          // 处理 ask_user 事件
          if (event.type === "ask_user") {
            setAskUserPending({
              id: event.id,
              question: event.question,
              options: event.options,
              multiple: event.multiple,
            });
          }
          onEvent(event);
          if ((event.type === "done" || event.type === "error") && !("subAgent" in event && event.subAgent)) {
            setIsStreaming(false);
            setAskUserPending(null);
            connRef.current = null;
            onDone();
          }
        });

        conn.onDisconnect(() => {
          setIsStreaming(false);
          setAskUserPending(null);
          connRef.current = null;
        });
      } catch (e: any) {
        setIsStreaming(false);
        setAskUserPending(null);
        onEvent({ type: "error", message: e.message || "Connection failed" });
        onDone();
      }
    },
    []
  );

  // 附加到后台运行中的会话
  const attachToConversation = useCallback(
    async (conversationId: string, onEvent: (event: ChatStreamEvent) => void, onDone: () => void) => {
      abortedRef.current = false;

      try {
        const conn = await connect(extensionMessage, "serviceWorker/agent/attachToConversation", {
          conversationId,
        });

        connRef.current = conn;

        conn.onMessage((msg) => {
          if (abortedRef.current) return;
          const event = msg.data as ChatStreamEvent;

          if (event.type === "ask_user") {
            setAskUserPending({
              id: event.id,
              question: event.question,
              options: event.options,
              multiple: event.multiple,
            });
          }

          onEvent(event);

          // sync 事件：根据 status 设置 isStreaming
          if (event.type === "sync") {
            if (event.status === "running") {
              setIsStreaming(true);
              if (event.pendingAskUser) {
                setAskUserPending(event.pendingAskUser);
              }
            } else {
              // done 或 error，无需保持连接
              setIsStreaming(false);
              connRef.current = null;
              onDone();
            }
            return;
          }

          if ((event.type === "done" || event.type === "error") && !("subAgent" in event && event.subAgent)) {
            setIsStreaming(false);
            setAskUserPending(null);
            connRef.current = null;
            onDone();
          }
        });

        conn.onDisconnect(() => {
          setIsStreaming(false);
          setAskUserPending(null);
          connRef.current = null;
        });
      } catch (e: any) {
        onEvent({ type: "error", message: e.message || "Attach failed" });
        onDone();
      }
    },
    []
  );

  return {
    isStreaming,
    setIsStreaming,
    sendMessage,
    stopGeneration,
    askUserPending,
    respondToAskUser,
    attachToConversation,
  };
}

// 查询正在运行的后台会话 ID
export function useRunningConversations() {
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const ids = await sendMsg(extensionMessage, "serviceWorker/agent/getRunningConversationIds", undefined);
      setRunningIds(new Set(ids as string[]));
    } catch {
      setRunningIds(new Set());
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { runningIds, refresh };
}

// 批量删除持久化消息
export async function deleteMessages(conversationId: string, messageIds: string[]): Promise<void> {
  const messages = await repo.getMessages(conversationId);
  const idSet = new Set(messageIds);
  const filtered = messages.filter((m) => !idSet.has(m.id));
  await repo.saveMessages(conversationId, filtered);
}

// 清空对话消息及任务
export async function clearMessages(conversationId: string): Promise<void> {
  await repo.saveMessages(conversationId, []);
  await repo.saveTasks(conversationId, []);
}

// 会话任务列表 hook
export function useConversationTasks(conversationId: string) {
  const [tasks, setTasks] = useState<Task[]>([]);

  const loadTasks = useCallback(async () => {
    if (!conversationId) {
      setTasks([]);
      return;
    }
    const loaded = await repo.getTasks(conversationId);
    setTasks(loaded);
  }, [conversationId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 处理流式 task_update 事件
  const handleTaskUpdate = useCallback((event: ChatStreamEvent) => {
    if (event.type === "task_update") {
      setTasks(event.tasks);
    }
  }, []);

  return { tasks, setTasks, loadTasks, handleTaskUpdate };
}

// Skill 列表 hook
export function useSkills() {
  const [skills, setSkills] = useState<SkillSummary[]>([]);

  const loadSkills = useCallback(async () => {
    try {
      const list = await skillRepo.listSkills();
      setSkills(list);
    } catch {
      setSkills([]);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  return { skills, loadSkills };
}
