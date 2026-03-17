import { useState, useRef, useEffect } from "react";
import type { ChatMessage, ContentBlock } from "@App/app/service/agent/types";
import ContentBlockRenderer from "./ContentBlockRenderer";
import ThinkingBlock from "./ThinkingBlock";
import ToolCallBlock from "./ToolCallBlock";
import MessageToolbar from "./MessageToolbar";
import { Message as ArcoMessage, Tooltip } from "@arco-design/web-react";
import {
  IconRobot,
  IconUser,
  IconEdit,
  IconCopy,
  IconRefresh,
  IconExclamationCircleFill,
} from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import { getTextContent } from "@App/app/service/agent/content_utils";

// 单条助手消息内容（无头像、无外层包装）
function AssistantMessageContent({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="tw-text-sm tw-min-w-0 tw-w-full">
      {/* Thinking 块 */}
      {message.thinking?.content && <ThinkingBlock content={message.thinking.content} />}

      {/* 主内容 */}
      {(typeof message.content === "string" ? message.content : message.content.length > 0) && (
        <div className={isStreaming ? "agent-streaming-cursor" : ""}>
          <ContentBlockRenderer content={message.content} />
        </div>
      )}

      {/* 流式指示 */}
      {isStreaming && !getTextContent(message.content) && !message.thinking?.content && (
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
        <div className="agent-error-block">
          <IconExclamationCircleFill className="agent-error-icon" />
          <span style={{ minWidth: 0, wordBreak: "break-word" }}>{message.error}</span>
        </div>
      )}
    </div>
  );
}

// 用户消息
export function UserMessageItem({
  message,
  onEdit,
  onRegenerate,
  isStreaming,
}: {
  message: ChatMessage;
  onEdit?: (newContent: string) => void;
  onRegenerate?: () => void;
  isStreaming?: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(getTextContent(message.content));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 进入编辑模式时聚焦并调整高度
  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
      // 光标移到末尾
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  const handleStartEdit = () => {
    setEditContent(getTextContent(message.content));
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditContent(getTextContent(message.content));
  };

  const handleSave = () => {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    setEditing(false);
    onEdit?.(trimmed);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getTextContent(message.content)).then(() => {
      ArcoMessage.success(t("agent_chat_copy_success"));
    });
  };

  const canInteract = !isStreaming;

  return (
    <div className="agent-message-item tw-flex tw-gap-3 tw-py-5 tw-flex-row-reverse">
      <div className="tw-w-8 tw-h-8 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-shrink-0 tw-shadow-sm tw-bg-gradient-to-br tw-from-[rgb(var(--arcoblue-5))] tw-to-[rgb(var(--arcoblue-6))] tw-text-white">
        <IconUser style={{ fontSize: 14 }} />
      </div>
      <div className="tw-flex tw-flex-col tw-items-end tw-max-w-[80%] tw-min-w-0">
        {editing ? (
          // 编辑模式：圆角容器，与消息气泡同宽
          <div className="agent-edit-container tw-rounded-2xl tw-rounded-tr-sm tw-overflow-hidden tw-min-w-[240px]">
            <textarea
              ref={textareaRef}
              className="tw-w-full tw-min-h-[40px] tw-max-h-[200px] tw-px-4 tw-pt-3 tw-pb-2 tw-bg-transparent tw-text-[var(--color-text-1)] tw-text-sm tw-resize-none tw-outline-none tw-border-none tw-leading-relaxed"
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") handleCancel();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
            <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-pb-2">
              <span className="tw-text-xs tw-text-[var(--color-text-4)]">
                {"Escape"} {t("agent_chat_cancel_edit")}
              </span>
              <div className="tw-flex tw-gap-1.5">
                <button
                  className="tw-px-3 tw-py-1.5 tw-rounded-lg tw-text-xs tw-font-medium tw-border tw-border-solid tw-border-[var(--color-border-2)] tw-bg-[var(--color-bg-1)] tw-text-[var(--color-text-2)] tw-cursor-pointer hover:tw-bg-[var(--color-fill-2)] tw-transition-colors"
                  onClick={handleCancel}
                >
                  {t("agent_chat_cancel_edit")}
                </button>
                <button
                  className="tw-px-3 tw-py-1.5 tw-rounded-lg tw-text-xs tw-font-medium tw-border-none tw-bg-[rgb(var(--arcoblue-6))] tw-text-white tw-cursor-pointer hover:tw-bg-[rgb(var(--arcoblue-5))] tw-transition-colors tw-shadow-sm"
                  onClick={handleSave}
                >
                  {t("agent_chat_save_and_send")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          // 只读模式：消息气泡 + 底部工具条
          <>
            {/* 文本气泡 */}
            {getTextContent(message.content) && (
              <div className="tw-px-4 tw-py-2.5 tw-rounded-2xl tw-rounded-tr-sm tw-bg-gradient-to-br tw-from-[rgb(var(--arcoblue-5))] tw-to-[rgb(var(--arcoblue-6))] tw-text-[var(--color-text-1)] dark:tw-text-white tw-text-sm tw-whitespace-pre-wrap tw-break-words tw-shadow-sm">
                {getTextContent(message.content)}
              </div>
            )}
            {/* 图片等非文本 blocks */}
            {Array.isArray(message.content) && message.content.some((b: ContentBlock) => b.type !== "text") && (
              <div className="tw-mt-1">
                <ContentBlockRenderer content={message.content.filter((b: ContentBlock) => b.type !== "text")} />
              </div>
            )}
            {canInteract && (
              <div className="agent-toolbar-actions tw-opacity-0 tw-transition-opacity tw-flex tw-items-center tw-mt-1 tw-gap-0.5">
                <Tooltip content={t("agent_chat_copy_message")} mini position="bottom">
                  <button
                    className="tw-w-6 tw-h-6 tw-flex tw-items-center tw-justify-center tw-rounded tw-bg-transparent tw-border-none tw-cursor-pointer tw-text-[var(--color-text-3)] hover:tw-text-[var(--color-text-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors"
                    onClick={handleCopy}
                  >
                    <IconCopy style={{ fontSize: 13 }} />
                  </button>
                </Tooltip>
                {onEdit && (
                  <Tooltip content={t("agent_chat_edit_message")} mini position="bottom">
                    <button
                      className="tw-w-6 tw-h-6 tw-flex tw-items-center tw-justify-center tw-rounded tw-bg-transparent tw-border-none tw-cursor-pointer tw-text-[var(--color-text-3)] hover:tw-text-[var(--color-text-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors"
                      onClick={handleStartEdit}
                    >
                      <IconEdit style={{ fontSize: 13 }} />
                    </button>
                  </Tooltip>
                )}
                {onRegenerate && (
                  <Tooltip content={t("agent_chat_regenerate")} mini position="bottom">
                    <button
                      className="tw-w-6 tw-h-6 tw-flex tw-items-center tw-justify-center tw-rounded tw-bg-transparent tw-border-none tw-cursor-pointer tw-text-[var(--color-text-3)] hover:tw-text-[var(--color-text-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors"
                      onClick={onRegenerate}
                    >
                      <IconRefresh style={{ fontSize: 13 }} />
                    </button>
                  </Tooltip>
                )}
              </div>
            )}
          </>
        )}
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
