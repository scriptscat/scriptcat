import type { ChatMessage } from "@App/app/service/agent/types";
import MarkdownRenderer from "./MarkdownRenderer";
import ThinkingBlock from "./ThinkingBlock";
import ToolCallBlock from "./ToolCallBlock";
import { IconRobot, IconUser } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";

export default function MessageItem({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const { t } = useTranslation();
  const isUser = message.role === "user";

  return (
    <div className={`tw-flex tw-gap-3 tw-py-4 ${isUser ? "tw-flex-row-reverse" : ""}`}>
      {/* 头像 */}
      <div
        className={`tw-w-8 tw-h-8 tw-rounded-lg tw-flex tw-items-center tw-justify-center tw-shrink-0 ${
          isUser
            ? "tw-bg-[rgb(var(--arcoblue-1))] tw-text-[rgb(var(--arcoblue-6))]"
            : "tw-bg-[var(--color-fill-2)] tw-text-[var(--color-text-2)]"
        }`}
      >
        {isUser ? <IconUser /> : <IconRobot />}
      </div>

      {/* 消息内容 */}
      <div className={`tw-flex tw-flex-col tw-max-w-[80%] tw-min-w-0 ${isUser ? "tw-items-end" : ""}`}>
        {isUser ? (
          <div className="tw-px-4 tw-py-2.5 tw-rounded-2xl tw-rounded-tr-sm tw-bg-[rgb(var(--arcoblue-6))] tw-text-white tw-text-sm tw-whitespace-pre-wrap tw-break-words">
            {message.content}
          </div>
        ) : (
          <div className="tw-text-sm tw-min-w-0 tw-w-full">
            {/* Thinking 块 */}
            {message.thinking?.content && <ThinkingBlock content={message.thinking.content} />}

            {/* 主内容 */}
            {message.content && <MarkdownRenderer content={message.content} />}

            {/* 流式指示 */}
            {isStreaming && !message.content && !message.thinking?.content && (
              <span className="tw-text-[var(--color-text-3)] tw-text-xs tw-animate-pulse">
                {t("agent_chat_streaming")}
              </span>
            )}

            {/* 工具调用 */}
            {message.toolCalls?.map((tc) => (
              <ToolCallBlock key={tc.id} toolCall={tc} />
            ))}

            {/* 错误 */}
            {message.error && (
              <div className="tw-mt-2 tw-px-3 tw-py-2 tw-rounded-lg tw-bg-[rgb(var(--red-1))] tw-text-[rgb(var(--red-6))] tw-text-xs">
                {t("agent_chat_error")}: {message.error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
