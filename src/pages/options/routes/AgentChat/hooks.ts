import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Conversation,
  ChatMessage,
  ChatStreamEvent,
  MessageRole,
  ToolDefinition,
} from "@App/app/service/agent/types";
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  // 加载会话列表
  const loadConversations = useCallback(async () => {
    const list = await repo.listConversations();
    setConversations(list);
    return list;
  }, []);

  useEffect(() => {
    loadConversations().then((list) => {
      // 进入页面时，如果有会话且未选中，则自动选中第一个
      if (list.length > 0) {
        setActiveId((prev) => prev || list[0].id);
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await repo.saveConversation(conv);
      const list = await loadConversations();
      setActiveId(conv.id);
      return { conv, list };
    },
    [loadConversations]
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
    [activeId, loadConversations]
  );

  // 重命名会话
  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const list = await repo.listConversations();
      const conv = list.find((c) => c.id === id);
      if (conv) {
        conv.title = title;
        conv.updatedAt = Date.now();
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
      modelId: string,
      allMessages: Array<{ role: MessageRole; content: string }>,
      onEvent: (event: ChatStreamEvent) => void,
      onDone: () => void,
      tools?: ToolDefinition[]
    ) => {
      setIsStreaming(true);
      abortedRef.current = false;

      try {
        const conn = await connect(extensionMessage, "serviceWorker/agent/chat", {
          conversationId,
          modelId,
          messages: allMessages,
          tools,
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

// 持久化消息的辅助函数
export async function persistMessage(message: ChatMessage): Promise<void> {
  await repo.appendMessage(message);
}

export async function updatePersistedMessage(message: ChatMessage): Promise<void> {
  await repo.updateMessage(message);
}

// 批量删除持久化消息
export async function deleteMessages(conversationId: string, messageIds: string[]): Promise<void> {
  const messages = await repo.getMessages(conversationId);
  const idSet = new Set(messageIds);
  const filtered = messages.filter((m) => !idSet.has(m.id));
  await repo.saveMessages(conversationId, filtered);
}

// 根据第一条用户消息自动生成会话标题
export async function autoTitleConversation(conversationId: string, firstUserMessage: string): Promise<void> {
  const title = firstUserMessage.slice(0, 30) + (firstUserMessage.length > 30 ? "..." : "");
  const conversations = await repo.listConversations();
  const conv = conversations.find((c) => c.id === conversationId);
  if (conv && conv.title === "New Chat") {
    conv.title = title;
    conv.updatedAt = Date.now();
    await repo.saveConversation(conv);
  }
}
