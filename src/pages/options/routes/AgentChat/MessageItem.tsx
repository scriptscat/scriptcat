import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Bot,
  Copy,
  File as FileIcon,
  Loader2,
  Paperclip,
  Pencil,
  PlayCircle,
  RefreshCw,
  User,
  X,
} from "lucide-react";
import type { ChatMessage, ContentBlock, MessageContent } from "@App/app/service/agent/core/types";
import { getTextContent } from "@App/app/service/agent/core/content_utils";
import { agentChatRepo } from "@App/app/repo/agent_chat";
import { t } from "@App/locales/locales";
import ContentBlockRenderer from "./ContentBlockRenderer";
import ThinkingBlock from "./ThinkingBlock";
import ToolCallBlock from "./ToolCallBlock";
import SubAgentBlock from "./SubAgentBlock";
import MessageToolbar from "./MessageToolbar";
import type { SubAgentState } from "./types";
import { getSubAgentForToolCall } from "./chat_utils";

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
  return (
    <div className="text-sm min-w-0 w-full">
      {message.thinking?.content && <ThinkingBlock content={message.thinking.content} />}

      {(typeof message.content === "string" ? message.content : message.content.length > 0) && (
        <ContentBlockRenderer content={message.content} />
      )}

      {/* 流式指示 */}
      {isStreaming && !getTextContent(message.content) && !message.thinking?.content && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          <span className="text-muted-foreground text-xs">{t("agent:chat_streaming")}</span>
        </div>
      )}

      {/* 工具调用 / 子代理 */}
      {message.toolCalls?.map((tc) => {
        const saState = getSubAgentForToolCall(tc, subAgents);
        if (saState) {
          return <SubAgentBlock key={tc.id} state={saState} />;
        }
        return <ToolCallBlock key={tc.id} toolCall={tc} />;
      })}

      {/* 系统警告 */}
      {message.warning && (
        <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg text-xs bg-warning-bg text-warning-fg">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{message.warning}</span>
        </div>
      )}

      {/* 错误 */}
      {message.error && (
        <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg text-xs bg-destructive/10 text-destructive">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{message.error}</span>
        </div>
      )}
    </div>
  );
}

// 编辑模式下新添加的附件类型
type EditPendingAttachment = { id: string; file: File; previewUrl: string };

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
    let url: string | null = null;
    agentChatRepo.getAttachment(block.attachmentId).then((blob) => {
      if (blob && !cancelled) {
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      }
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [block]);

  const name = block.type !== "text" && "name" in block ? block.name || "" : "";

  return (
    <div className="relative group shrink-0">
      {block.type === "image" ? (
        previewUrl ? (
          <img src={previewUrl} alt={name} className="size-16 rounded-lg object-cover border border-border" />
        ) : (
          <div className="size-16 rounded-lg border border-border bg-muted flex items-center justify-center text-xs text-muted-foreground">
            {"..."}
          </div>
        )
      ) : (
        <div
          className="size-16 rounded-lg border border-border bg-muted flex flex-col items-center justify-center gap-0.5"
          title={name}
        >
          {block.type === "audio" ? (
            <PlayCircle className="size-5 text-muted-foreground" />
          ) : (
            <FileIcon className="size-5 text-muted-foreground" />
          )}
          <span className="text-[9px] text-muted-foreground max-w-[56px] truncate px-0.5">
            {name.length > 8 ? name.slice(0, 5) + "..." + (name.split(".").pop() || "") : name}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 size-5 rounded-full flex items-center justify-center bg-foreground/70 text-background border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="size-2.5" />
      </button>
    </div>
  );
}

const iconBtn =
  "size-6 max-md:size-11 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent transition-colors";

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
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(getTextContent(message.content));
  const [editBlocks, setEditBlocks] = useState<ContentBlock[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<EditPendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
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
    pendingAttachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
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
    addFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getTextContent(message.content)).then(() => {
      toast.success(t("agent:chat_copy_success"));
    });
  };

  const canInteract = !isStreaming;
  const textContent = getTextContent(message.content);
  const nonTextBlocks = Array.isArray(message.content) ? message.content.filter((b) => b.type !== "text") : [];

  return (
    <div className="flex gap-3 py-5 flex-row-reverse group/msg">
      <div className="size-8 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-gradient-to-br from-primary to-primary-hover text-primary-foreground">
        <User className="size-3.5" />
      </div>
      <div className="flex flex-col items-end max-w-[80%] min-w-0">
        {editing ? (
          <div className="rounded-2xl rounded-tr-sm overflow-hidden min-w-[240px] border border-border bg-card">
            {(editBlocks.length > 0 || pendingAttachments.length > 0) && (
              <div className="flex gap-2 px-4 pt-3 pb-1 flex-wrap">
                {editBlocks.map((block, index) => (
                  <ExistingAttachmentPreview
                    key={`existing-${index}`}
                    block={block}
                    onRemove={() => setEditBlocks((prev) => prev.filter((_, i) => i !== index))}
                  />
                ))}
                {pendingAttachments.map((att) => (
                  <div key={att.id} className="relative group shrink-0">
                    {att.previewUrl ? (
                      <img
                        src={att.previewUrl}
                        alt={att.file.name}
                        className="size-16 rounded-lg object-cover border border-border"
                      />
                    ) : (
                      <div
                        className="size-16 rounded-lg border border-border bg-muted flex flex-col items-center justify-center gap-0.5"
                        title={att.file.name}
                      >
                        {att.file.type.startsWith("audio/") ? (
                          <PlayCircle className="size-5 text-muted-foreground" />
                        ) : (
                          <FileIcon className="size-5 text-muted-foreground" />
                        )}
                        <span className="text-[9px] text-muted-foreground max-w-[56px] truncate px-0.5">
                          {att.file.name.length > 8
                            ? att.file.name.slice(0, 5) + "..." + (att.file.name.split(".").pop() || "")
                            : att.file.name}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removePendingAttachment(att.id)}
                      className="absolute -top-1.5 -right-1.5 size-5 rounded-full flex items-center justify-center bg-foreground/70 text-background border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="size-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

            <textarea
              ref={textareaRef}
              data-testid="user-edit-textarea"
              className="w-full min-h-[40px] max-h-[200px] px-4 pt-3 pb-2 bg-transparent text-foreground text-sm resize-none outline-none border-none leading-relaxed"
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
            <div className="flex items-center justify-between px-3 pb-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={iconBtn}
                title={t("agent:chat_attach_file")}
                aria-label={t("agent:chat_attach_file")}
              >
                <Paperclip className="size-3.5" />
              </button>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-foreground/80 cursor-pointer hover:bg-accent transition-colors"
                  onClick={handleCancel}
                >
                  {t("agent:chat_cancel_edit")}
                </button>
                <button
                  type="button"
                  data-testid="user-edit-save"
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border-none bg-primary text-primary-foreground cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
                  onClick={handleSave}
                >
                  {t("agent:chat_save_and_send")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {textContent && (
              <div className="px-4 py-2.5 rounded-2xl rounded-tr-sm bg-gradient-to-br from-primary to-primary-hover text-primary-foreground text-sm whitespace-pre-wrap break-words shadow-sm">
                {textContent}
              </div>
            )}
            {nonTextBlocks.length > 0 && (
              <div className="mt-1">
                <ContentBlockRenderer content={nonTextBlocks} />
              </div>
            )}
            {onCancel ? (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-muted-foreground">{t("agent:chat_message_queued")}</span>
                <button
                  type="button"
                  className={iconBtn}
                  title={t("agent:chat_cancel_message")}
                  aria-label={t("agent:chat_cancel_message")}
                  onClick={onCancel}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              canInteract && (
                <div className="opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center mt-1 gap-0.5">
                  <button
                    type="button"
                    data-testid="user-copy"
                    className={iconBtn}
                    title={t("agent:chat_copy_message")}
                    aria-label={t("agent:chat_copy_message")}
                    onClick={handleCopy}
                  >
                    <Copy className="size-3.5" />
                  </button>
                  {onEdit && (
                    <button
                      type="button"
                      data-testid="user-edit"
                      className={iconBtn}
                      title={t("agent:chat_edit_message")}
                      aria-label={t("agent:chat_edit_message")}
                      onClick={handleStartEdit}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                  {onRegenerate && (
                    <button
                      type="button"
                      data-testid="user-regenerate"
                      className={iconBtn}
                      title={t("agent:chat_regenerate")}
                      aria-label={t("agent:chat_regenerate")}
                      onClick={onRegenerate}
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
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
  const lastMsg = messages[messages.length - 1];
  const usage = lastMsg.usage;
  const durationMs = lastMsg.durationMs;
  const firstTokenMs = lastMsg.firstTokenMs;

  const toolCallCount = messages.reduce((sum, m) => sum + (m.toolCalls?.length || 0), 0);
  const isGroupStreaming = isStreaming && messages.some((m) => m.id === streamingId);

  return (
    <div className="flex gap-3 py-5 group/msg">
      <div className="size-8 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-primary-light text-primary">
        <Bot className="size-[18px]" />
      </div>

      <div className="flex flex-col max-w-[80%] min-w-0 gap-1">
        {messages.map((m) => (
          <AssistantMessageContent key={m.id} message={m} isStreaming={streamingId === m.id} subAgents={subAgents} />
        ))}

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
