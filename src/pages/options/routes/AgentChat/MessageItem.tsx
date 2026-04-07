import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage, ContentBlock, MessageContent } from "@App/app/service/agent/core/types";
import ContentBlockRenderer from "./ContentBlockRenderer";
import ThinkingBlock from "./ThinkingBlock";
import ToolCallBlock from "./ToolCallBlock";
import SubAgentBlock from "./SubAgentBlock";
import type { SubAgentState } from "./SubAgentBlock";
import MessageToolbar from "./MessageToolbar";
import { Message as ArcoMessage, Tooltip } from "@arco-design/web-react";
import {
  IconRobot,
  IconUser,
  IconEdit,
  IconCopy,
  IconRefresh,
  IconExclamationCircleFill,
  IconClose,
  IconFile,
  IconPlayCircle,
} from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import { getTextContent } from "@App/app/service/agent/core/content_utils";
import { getSubAgentForToolCall } from "./chat_utils";
import { AgentChatRepo } from "@App/app/repo/agent_chat";

const chatRepo = new AgentChatRepo();

// 单条助手消息内容（无头像、无外层包装）
function AssistantMessageContent({
  message,
  isStreaming,
  subAgents,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  subAgents?: Map<string, SubAgentState>;
}) {
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
      {message.toolCalls?.map((tc) => {
        const saState = getSubAgentForToolCall(tc, subAgents);
        if (saState) {
          return <SubAgentBlock key={tc.id} state={saState} />;
        }
        return <ToolCallBlock key={tc.id} toolCall={tc} />;
      })}

      {/* 系统警告 */}
      {message.warning && (
        <div className="agent-warning-block">
          <IconExclamationCircleFill className="agent-warning-icon" />
          <span style={{ minWidth: 0, wordBreak: "break-word" }}>{message.warning}</span>
        </div>
      )}

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

// 编辑模式下新添加的附件类型
type EditPendingAttachment = {
  id: string;
  file: File;
  previewUrl: string;
};

// 从消息内容中提取非文本 blocks
function getNonTextBlocks(content: MessageContent): ContentBlock[] {
  if (typeof content === "string") return [];
  return content.filter((b) => b.type !== "text");
}

// 编辑模式下现有附件的预览
function ExistingAttachmentPreview({ block, onRemove }: { block: ContentBlock; onRemove: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (block.type !== "image") return;
    let cancelled = false;
    chatRepo.getAttachment(block.attachmentId).then((blob) => {
      if (blob && !cancelled) setPreviewUrl(URL.createObjectURL(blob));
    });
    return () => {
      cancelled = true;
    };
  }, [block]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const name = block.type !== "text" && "name" in block ? block.name || "" : "";

  return (
    <div className="tw-relative tw-group tw-shrink-0">
      {block.type === "image" ? (
        previewUrl ? (
          <img
            src={previewUrl}
            alt={name}
            className="tw-w-16 tw-h-16 tw-rounded-lg tw-object-cover tw-border tw-border-solid tw-border-[var(--color-border-2)]"
          />
        ) : (
          <div className="tw-w-16 tw-h-16 tw-rounded-lg tw-border tw-border-solid tw-border-[var(--color-border-2)] tw-bg-[var(--color-fill-1)] tw-flex tw-items-center tw-justify-center tw-text-xs tw-text-[var(--color-text-4)]">
            {"..."}
          </div>
        )
      ) : (
        <div
          className="tw-w-16 tw-h-16 tw-rounded-lg tw-border tw-border-solid tw-border-[var(--color-border-2)] tw-bg-[var(--color-fill-1)] tw-flex tw-flex-col tw-items-center tw-justify-center tw-gap-0.5"
          title={name}
        >
          {block.type === "audio" ? (
            <IconPlayCircle style={{ fontSize: 20 }} className="tw-text-[var(--color-text-3)]" />
          ) : (
            <IconFile style={{ fontSize: 20 }} className="tw-text-[var(--color-text-3)]" />
          )}
          <span className="tw-text-[9px] tw-text-[var(--color-text-4)] tw-max-w-[56px] tw-truncate tw-px-0.5">
            {name.length > 8 ? name.slice(0, 5) + "..." + (name.split(".").pop() || "") : name}
          </span>
        </div>
      )}
      <button
        onClick={onRemove}
        className="tw-absolute tw--top-1.5 tw--right-1.5 tw-w-5 tw-h-5 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-bg-[var(--color-bg-5)] tw-text-white tw-border-none tw-cursor-pointer tw-opacity-0 group-hover:tw-opacity-100 tw-transition-opacity tw-text-xs tw-leading-none"
      >
        <IconClose style={{ fontSize: 10 }} />
      </button>
    </div>
  );
}

// 用户消息
export function UserMessageItem({
  message,
  onEdit,
  onRegenerate,
  isStreaming,
  onCancel,
}: {
  message: ChatMessage;
  onEdit?: (content: MessageContent, files?: Map<string, File>) => void;
  onRegenerate?: () => void;
  isStreaming?: boolean;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(getTextContent(message.content));
  // 编辑模式下的现有附件 blocks
  const [editBlocks, setEditBlocks] = useState<ContentBlock[]>([]);
  // 编辑模式下新添加的附件
  const [pendingAttachments, setPendingAttachments] = useState<EditPendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setEditBlocks(getNonTextBlocks(message.content));
    setPendingAttachments([]);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditContent(getTextContent(message.content));
    pendingAttachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setPendingAttachments([]);
    setEditBlocks([]);
  };

  const handleSave = () => {
    const trimmed = editContent.trim();
    const hasAttachments = editBlocks.length > 0 || pendingAttachments.length > 0;
    if (!trimmed && !hasAttachments) return;
    setEditing(false);

    if (!hasAttachments) {
      onEdit?.(trimmed);
      return;
    }

    // 构建 ContentBlock[] 和 files Map
    const blocks: ContentBlock[] = [];
    if (trimmed) blocks.push({ type: "text", text: trimmed });
    blocks.push(...editBlocks);

    const files = new Map<string, File>();
    for (const att of pendingAttachments) {
      const mime = att.file.type;
      if (mime.startsWith("image/")) {
        blocks.push({ type: "image", attachmentId: att.id, mimeType: mime, name: att.file.name });
      } else if (mime.startsWith("audio/")) {
        blocks.push({ type: "audio", attachmentId: att.id, mimeType: mime, name: att.file.name });
      } else {
        blocks.push({ type: "file", attachmentId: att.id, mimeType: mime, name: att.file.name, size: att.file.size });
      }
      files.set(att.id, att.file);
    }

    onEdit?.(blocks, files.size > 0 ? files : undefined);
  };

  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const newAttachments = files.map((file) => {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : file.type.split("/")[1] || "bin";
      return {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`,
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      };
    });
    setPendingAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removePendingAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handleEditPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
    e.target.value = "";
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
          // 编辑模式：圆角容器，支持附件编辑
          <div className="agent-edit-container tw-rounded-2xl tw-rounded-tr-sm tw-overflow-hidden tw-min-w-[240px]">
            {/* 附件预览区域 */}
            {(editBlocks.length > 0 || pendingAttachments.length > 0) && (
              <div className="tw-flex tw-gap-2 tw-px-4 tw-pt-3 tw-pb-1 tw-flex-wrap">
                {/* 现有附件 */}
                {editBlocks.map((block, index) => (
                  <ExistingAttachmentPreview
                    key={`existing-${index}`}
                    block={block}
                    onRemove={() => setEditBlocks((prev) => prev.filter((_, i) => i !== index))}
                  />
                ))}
                {/* 新添加的附件 */}
                {pendingAttachments.map((att) => (
                  <div key={att.id} className="tw-relative tw-group tw-shrink-0">
                    {att.previewUrl ? (
                      <img
                        src={att.previewUrl}
                        alt={att.file.name}
                        className="tw-w-16 tw-h-16 tw-rounded-lg tw-object-cover tw-border tw-border-solid tw-border-[var(--color-border-2)]"
                      />
                    ) : (
                      <div
                        className="tw-w-16 tw-h-16 tw-rounded-lg tw-border tw-border-solid tw-border-[var(--color-border-2)] tw-bg-[var(--color-fill-1)] tw-flex tw-flex-col tw-items-center tw-justify-center tw-gap-0.5"
                        title={att.file.name}
                      >
                        {att.file.type.startsWith("audio/") ? (
                          <IconPlayCircle style={{ fontSize: 20 }} className="tw-text-[var(--color-text-3)]" />
                        ) : (
                          <IconFile style={{ fontSize: 20 }} className="tw-text-[var(--color-text-3)]" />
                        )}
                        <span className="tw-text-[9px] tw-text-[var(--color-text-4)] tw-max-w-[56px] tw-truncate tw-px-0.5">
                          {att.file.name.length > 8
                            ? att.file.name.slice(0, 5) + "..." + (att.file.name.split(".").pop() || "")
                            : att.file.name}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => removePendingAttachment(att.id)}
                      className="tw-absolute tw--top-1.5 tw--right-1.5 tw-w-5 tw-h-5 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-bg-[var(--color-bg-5)] tw-text-white tw-border-none tw-cursor-pointer tw-opacity-0 group-hover:tw-opacity-100 tw-transition-opacity tw-text-xs tw-leading-none"
                    >
                      <IconClose style={{ fontSize: 10 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 隐藏的文件选择器 */}
            <input ref={fileInputRef} type="file" multiple className="tw-hidden" onChange={handleFileSelect} />

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
              onPaste={handleEditPaste}
            />
            <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-pb-2">
              <div className="tw-flex tw-items-center tw-gap-2">
                <span className="tw-text-xs tw-text-[var(--color-text-4)]">
                  {"Escape"} {t("agent_chat_cancel_edit")}
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="tw-w-6 tw-h-6 tw-rounded tw-flex tw-items-center tw-justify-center tw-bg-transparent tw-border-none tw-cursor-pointer tw-text-[var(--color-text-3)] hover:tw-text-[var(--color-text-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors"
                  title={t("agent_chat_attach_file")}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
              </div>
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
            {onCancel ? (
              <div className="tw-flex tw-items-center tw-gap-1 tw-mt-1">
                <span className="tw-text-xs tw-text-[var(--color-text-3)]">{t("agent_chat_message_queued")}</span>
                <Tooltip content={t("agent_chat_cancel_message")} mini position="bottom">
                  <button
                    className="tw-w-6 tw-h-6 tw-flex tw-items-center tw-justify-center tw-rounded tw-bg-transparent tw-border-none tw-cursor-pointer tw-text-[var(--color-text-3)] hover:tw-text-[var(--color-text-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors"
                    onClick={onCancel}
                  >
                    <IconClose style={{ fontSize: 13 }} />
                  </button>
                </Tooltip>
              </div>
            ) : (
              canInteract && (
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
              )
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
  subAgents,
  onCopy,
  onRegenerate,
  onDelete,
}: {
  messages: ChatMessage[];
  streamingId?: string;
  isStreaming?: boolean;
  streamStartTime?: number;
  subAgents?: Map<string, SubAgentState>;
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
          <AssistantMessageContent
            key={msg.id}
            message={msg}
            isStreaming={streamingId === msg.id}
            subAgents={subAgents}
          />
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
