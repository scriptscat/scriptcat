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
import { agentChatRepo } from "@App/app/repo/agent_chat";
import { SkillRepo } from "@App/app/repo/skill_repo";
import { message as extensionMessage } from "@App/pages/store/global";
import { connect, sendMessage as sendMsg } from "@Packages/message/client";
import type { MessageConnect } from "@Packages/message/types";

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
    const list = await agentChatRepo.listConversations();
    setConversations(list);
    return list;
  }, []);

  useEffect(() => {
    void (async () => {
      const list = await loadConversations();
      if (list.length > 0 && !activeId) {
        // 进入页面时，如果有会话且 URL 中无 id 参数，则自动选中第一个
        setActiveId(list[0].id);
      }
    })();
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
      const created = await agentChatRepo.createConversation(conv);
      const list = await loadConversations();
      setActiveId(created.id);
      return { conv: created, list };
    },
    [loadConversations, setActiveId]
  );

  // 删除会话
  const deleteConversation = useCallback(
    async (id: string) => {
      const conversation = conversations.find((item) => item.id === id);
      if (conversation?.generation) {
        await sendMsg(extensionMessage, "serviceWorker/agent/conversation", {
          action: "delete",
          conversationId: id,
          generation: conversation.generation,
        });
      }
      const list = await loadConversations();
      if (activeId === id) {
        setActiveId(list[0]?.id || "");
      }
    },
    [activeId, conversations, loadConversations, setActiveId]
  );

  // 重命名会话
  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const list = await agentChatRepo.listConversations();
      const conv = list.find((c) => c.id === id);
      if (conv) {
        conv.title = title;
        conv.updatetime = Date.now();
        await agentChatRepo.saveConversation(conv);
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
    const msgs = await agentChatRepo.getMessages(conversationId);
    setMessages(msgs);
  }, [conversationId]);

  useEffect(() => {
    void (async () => {
      await loadMessages();
    })();
  }, [loadMessages]);

  return { messages, setMessages, loadMessages };
}

// ask_user 待回复状态
export type AskUserPending = {
  id: string;
  question: string;
  options?: string[];
  optionValues?: string[];
  multiple?: boolean;
  allowCustom?: boolean;
};

// 流式聊天 hook
export function useStreamingChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [askUserPending, setAskUserPending] = useState<AskUserPending | null>(null);
  const connRef = useRef<MessageConnect | null>(null);
  const abortedRef = useRef(false);

  const stopGeneration = useCallback(() => {
    abortedRef.current = true;
    const conn = connRef.current;
    setAskUserPending(null);
    // 不在这里把 isStreaming 置 false、也不立即断开连接——ChatArea 里"连接断开但 done
    // 回调未触发时处理排队消息"的兜底逻辑正是监听 isStreaming 由 true 变 false 来触发的；
    // 提前置为 false 会让排队消息在旧会话仍处于 cancelling（占用中）时就被处理，进而被拒绝
    // 且从未持久化就丢失（见 finding 6）。isStreaming 必须留到真正的终态事件到达时
    // （onMessage 的终态分支）或连接意外断开时（onDisconnect）才由那两处统一置 false。
    if (conn) {
      try {
        conn.sendMessage({ action: "stop" });
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
          const event = msg.data as ChatStreamEvent;
          const isTerminal =
            (event.type === "done" || event.type === "error") && !("subAgent" in event && event.subAgent);
          // stop 之后（abortedRef=true）必须继续放行终态事件——那条事件携带真正的取消原因/
          // usage/耗时，且负责断开连接、触发 onDone（进而处理排队消息）；只需要抑制中间的
          // 流式增量/ask_user 事件，避免用户点了停止之后 UI 还在继续刷新内容（见 finding 6）
          if (abortedRef.current && !isTerminal) return;
          // 处理 ask_user 事件
          if (event.type === "ask_user") {
            setAskUserPending({
              id: event.id,
              question: event.question,
              options: event.options,
              optionValues: event.optionValues,
              multiple: event.multiple,
              allowCustom: event.allowCustom,
            });
          }
          if (event.type === "ask_user_expired") setAskUserPending(null);
          if (event.type === "ask_user_resolved") setAskUserPending(null);
          onEvent(event);
          if (isTerminal) {
            setIsStreaming(false);
            setAskUserPending(null);
            connRef.current = null;
            // 终态事件后必须主动断开，否则 port/listener 会一直挂在 SW 侧，直到用户手动刷新页面
            conn.disconnect();
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
          const event = msg.data as ChatStreamEvent;
          const isTerminalEvent =
            (event.type === "done" || event.type === "error") && !("subAgent" in event && event.subAgent);
          // 与 sendMessage() 同理：stop 之后必须继续放行终态事件（含终态 sync），
          // 否则会错过真正携带取消原因/usage 的那条事件，也无法触发 onDone 处理排队消息
          // （见 finding 6）
          if (abortedRef.current && event.type !== "sync" && !isTerminalEvent) return;

          if (event.type === "ask_user") {
            setAskUserPending({
              id: event.id,
              question: event.question,
              options: event.options,
              optionValues: event.optionValues,
              multiple: event.multiple,
              allowCustom: event.allowCustom,
            });
          }
          if (event.type === "ask_user_expired") setAskUserPending(null);
          if (event.type === "ask_user_resolved") setAskUserPending(null);

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
              // 终态 sync 后必须主动断开，否则 port/listener 会一直挂在 SW 侧
              conn.disconnect();
              onDone();
            }
            return;
          }

          if (isTerminalEvent) {
            setIsStreaming(false);
            setAskUserPending(null);
            connRef.current = null;
            conn.disconnect();
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
    void (async () => {
      await refresh();
    })();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { runningIds, refresh };
}

// 批量删除持久化消息
export async function deleteMessages(conversationId: string, messageIds: string[]): Promise<void> {
  await sendMsg(extensionMessage, "serviceWorker/agent/conversation", {
    action: "deleteMessages",
    conversationId,
    messageIds,
  });
}

// 清空对话消息及任务
export async function clearMessages(conversationId: string): Promise<void> {
  await sendMsg(extensionMessage, "serviceWorker/agent/conversation", {
    action: "clearMessages",
    conversationId,
  });
}

// 会话任务列表 hook
export function useConversationTasks(conversationId: string) {
  const [tasks, setTasks] = useState<Task[]>([]);

  const loadTasks = useCallback(async () => {
    if (!conversationId) {
      setTasks([]);
      return;
    }
    const loaded = await agentChatRepo.getTasks(conversationId);
    setTasks(loaded);
  }, [conversationId]);

  useEffect(() => {
    void (async () => {
      await loadTasks();
    })();
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
    void (async () => {
      await loadSkills();
    })();
  }, [loadSkills]);

  return { skills, loadSkills };
}
