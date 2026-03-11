import type { ChatMessage } from "@App/app/service/agent/types";
import MarkdownRenderer from "./MarkdownRenderer";
import ThinkingBlock from "./ThinkingBlock";
import ToolCallBlock from "./ToolCallBlock";
import MessageToolbar from "./MessageToolbar";
import { IconRobot, IconUser } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";

// 单条助手消息内容（无头像、无外层包装）
function AssistantMessageContent({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="tw-text-sm tw-min-w-0 tw-w-full">
      {/* Thinking 块 */}
      {message.thinking?.content && <ThinkingBlock content={message.thinking.content} />}

      {/* 主内容 */}
      {message.content && (
        <div className={isStreaming ? "agent-streaming-cursor" : ""}>
          <MarkdownRenderer content={message.content} />
        </div>
      )}

      {/* 流式指示 */}
      {isStreaming && !message.content && !message.thinking?.content && (
        <div className="tw-flex tw-items-center tw-gap-2 tw-py-2">
          <div className="agent-tool-spinner" />
          <span className="tw-text-[var(--color-text-3)] tw-text-xs">{t("agent_chat_streaming")}</span>
        </div>
      )}

      {/* 工具调用 */}
      {message.toolCalls?.map((tc) => (
        <ToolCallBlock key={tc.id} toolCall={tc} />
      ))}

      {/* 错误 */}
      {message.error && (
        <div className="tw-mt-2 tw-px-3 tw-py-2 tw-rounded-lg tw-bg-[rgb(var(--red-1))] tw-text-[rgb(var(--red-6))] tw-text-xs tw-border tw-border-solid tw-border-[rgb(var(--red-2))]">
          {t("agent_chat_error")}
          {": "}
          {message.error}
        </div>
      )}
    </div>
  );
}

// 用户消息
export function UserMessageItem({ message }: { message: ChatMessage }) {
  return (
    <div className="agent-message-item tw-flex tw-gap-3 tw-py-5 tw-flex-row-reverse">
      <div className="tw-w-8 tw-h-8 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-shrink-0 tw-shadow-sm tw-bg-gradient-to-br tw-from-[rgb(var(--arcoblue-5))] tw-to-[rgb(var(--arcoblue-6))] tw-text-white">
        <IconUser style={{ fontSize: 14 }} />
      </div>
      <div className="tw-flex tw-flex-col tw-max-w-[80%] tw-min-w-0 tw-items-end">
        <div className="tw-px-4 tw-py-2.5 tw-rounded-2xl tw-rounded-tr-sm tw-bg-gradient-to-br tw-from-[rgb(var(--arcoblue-5))] tw-to-[rgb(var(--arcoblue-6))] tw-text-white tw-text-sm tw-whitespace-pre-wrap tw-break-words tw-shadow-sm">
          {message.content}
        </div>
      </div>
    </div>
  );
}

// 助手消息组（连续的 assistant 消息共享一个头像）
export function AssistantMessageGroup({
  messages,
  streamingId,
  isStreaming,
  streamStartTime,
  onCopy,
  onRegenerate,
  onDelete,
}: {
  messages: ChatMessage[];
  streamingId?: string;
  isStreaming?: boolean;
  streamStartTime?: number;
  onCopy: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
}) {
  // 从组内最后一条消息获取元数据（done 事件数据写在最后一条 assistant 消息上）
  const lastMsg = messages[messages.length - 1];
  const usage = lastMsg.usage;
  const durationMs = lastMsg.durationMs;
  const firstTokenMs = lastMsg.firstTokenMs;

  // 统计组内所有 toolCalls 总数
  const toolCallCount = messages.reduce((sum, m) => sum + (m.toolCalls?.length || 0), 0);

  // 是否正在流式生成这个组
  const isGroupStreaming = isStreaming && messages.some((m) => m.id === streamingId);

  return (
    <div className="agent-message-item tw-flex tw-gap-3 tw-py-5">
      {/* 头像：只显示一次 */}
      <div className="tw-w-8 tw-h-8 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-shrink-0 tw-shadow-sm tw-bg-[var(--color-fill-2)] tw-text-[var(--color-text-2)]">
        <IconRobot style={{ fontSize: 14 }} />
      </div>

      {/* 消息内容：连续的 assistant 消息纵向排列 */}
      <div className="tw-flex tw-flex-col tw-max-w-[80%] tw-min-w-0 tw-gap-1">
        {messages.map((msg) => (
          <AssistantMessageContent key={msg.id} message={msg} isStreaming={streamingId === msg.id} />
        ))}

        {/* 工具条 */}
        <MessageToolbar
          usage={usage}
          durationMs={durationMs}
          firstTokenMs={firstTokenMs}
          toolCallCount={toolCallCount}
          isStreaming={isGroupStreaming}
          streamStartTime={streamStartTime}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
