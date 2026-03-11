import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Empty } from "@arco-design/web-react";
import type { AgentModelConfig } from "@App/pkg/config/config";
import type { ChatMessage, ChatStreamEvent } from "@App/app/service/agent/types";
import MessageItem from "./MessageItem";
import ChatInput from "./ChatInput";
import { useMessages, useStreamingChat, persistMessage, autoTitleConversation } from "./hooks";

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

export default function ChatArea({
  conversationId,
  models,
  selectedModelId,
  onModelChange,
  onConversationTitleChange,
}: {
  conversationId: string;
  models: AgentModelConfig[];
  selectedModelId: string;
  onModelChange: (id: string) => void;
  onConversationTitleChange?: () => void;
}) {
  const { t } = useTranslation();
  const { messages, setMessages, loadMessages } = useMessages(conversationId);
  const { isStreaming, sendMessage, stopGeneration } = useStreamingChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMsgRef = useRef<ChatMessage | null>(null);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async (content: string) => {
    if (!conversationId || !selectedModelId) return;

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: genId(),
      conversationId,
      role: "user",
      content,
      createdAt: Date.now(),
    };
    await persistMessage(userMsg);

    // 创建助手消息占位
    const assistantMsg: ChatMessage = {
      id: genId(),
      conversationId,
      role: "assistant",
      content: "",
      modelId: selectedModelId,
      createdAt: Date.now(),
    };
    streamingMsgRef.current = assistantMsg;

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    // 自动设置标题（仅首条消息时）
    const isFirstMessage = messages.length === 0;
    if (isFirstMessage) {
      autoTitleConversation(conversationId, content).then(() => {
        onConversationTitleChange?.();
      });
    }

    // 构造发送给 AI 的消息列表
    const allMsgs = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    sendMessage(
      conversationId,
      selectedModelId,
      allMsgs,
      (event: ChatStreamEvent) => {
        const msg = streamingMsgRef.current;
        if (!msg) return;

        switch (event.type) {
          case "content_delta":
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
          case "error":
            msg.error = event.message;
            break;
          case "done":
            // 完成
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
        // 流结束，持久化助手消息
        const msg = streamingMsgRef.current;
        if (msg) {
          await persistMessage(msg);
          streamingMsgRef.current = null;
        }
        // 重新加载确保一致性
        loadMessages();
      }
    );
  };

  const noModel = models.length === 0;

  return (
    <div className="tw-flex tw-flex-col tw-flex-1 tw-min-w-0 tw-h-full">
      {/* 消息列表 */}
      <div className="tw-flex-1 tw-overflow-y-auto tw-px-4">
        <div className="tw-max-w-3xl tw-mx-auto">
          {!conversationId ? (
            <div className="tw-flex tw-items-center tw-justify-center tw-h-full tw-py-20">
              <Empty description={t("agent_chat_no_conversations")} />
            </div>
          ) : messages.length === 0 && !isStreaming ? (
            <div className="tw-flex tw-items-center tw-justify-center tw-h-full tw-py-20">
              <Empty description={t("agent_chat_input_placeholder")} />
            </div>
          ) : (
            mergeToolResults(messages).map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && msg.id === streamingMsgRef.current?.id}
              />
            ))
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
      />
      {noModel && (
        <div className="tw-text-center tw-text-xs tw-text-[var(--color-text-3)] tw-pb-2">
          {t("agent_chat_no_model")}
        </div>
      )}
    </div>
  );
}
