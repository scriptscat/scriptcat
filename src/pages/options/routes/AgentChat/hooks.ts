import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Conversation, ChatMessage, ChatStreamEvent } from "@App/app/service/agent/types";
import { AgentChatRepo } from "@App/app/repo/agent_chat";
import { message as extensionMessage } from "@App/pages/store/global";
import { connect } from "@Packages/message/client";
import type { MessageConnect } from "@Packages/message/types";

const repo = new AgentChatRepo();

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
  }, [loadConversations]);

  // 创建新会话
  const createConversation = useCallback(
    async (modelId: string) => {
      const conv: Conversation = {
        id: genId(),
        title: "New Chat",
        modelId,
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

// 流式聊天 hook
export function useStreamingChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const connRef = useRef<MessageConnect | null>(null);
  const abortedRef = useRef(false);

  const stopGeneration = useCallback(() => {
    abortedRef.current = true;
    if (connRef.current) {
      connRef.current.disconnect();
      connRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (
      conversationId: string,
      message: string,
      onEvent: (event: ChatStreamEvent) => void,
      onDone: () => void,
      modelId?: string
    ) => {
      setIsStreaming(true);
      abortedRef.current = false;

      try {
        const conn = await connect(extensionMessage, "serviceWorker/agent/conversationChat", {
          conversationId,
          message,
          modelId,
        });

        connRef.current = conn;

        conn.onMessage((msg) => {
          if (abortedRef.current) return;
          const event = msg.data as ChatStreamEvent;
          onEvent(event);
          if (event.type === "done" || event.type === "error") {
            setIsStreaming(false);
            connRef.current = null;
            onDone();
          }
        });

        conn.onDisconnect(() => {
          setIsStreaming(false);
          connRef.current = null;
        });
      } catch (e: any) {
        setIsStreaming(false);
        onEvent({ type: "error", message: e.message || "Connection failed" });
        onDone();
      }
    },
    []
  );

  return { isStreaming, sendMessage, stopGeneration };
}

// 批量删除持久化消息
export async function deleteMessages(conversationId: string, messageIds: string[]): Promise<void> {
  const messages = await repo.getMessages(conversationId);
  const idSet = new Set(messageIds);
  const filtered = messages.filter((m) => !idSet.has(m.id));
  await repo.saveMessages(conversationId, filtered);
}

// 清空对话消息
export async function clearMessages(conversationId: string): Promise<void> {
  await repo.saveMessages(conversationId, []);
}
