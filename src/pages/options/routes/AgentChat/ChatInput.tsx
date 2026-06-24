import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Select, Tooltip, Message as ArcoMessage } from "@arco-design/web-react";
import {
  IconSend,
  IconPause,
  IconImage,
  IconClose,
  IconEye,
  IconTool,
  IconFile,
  IconPlayCircle,
  IconThunderbolt,
} from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import type { AgentModelConfig, SkillSummary, MessageContent, ContentBlock } from "@App/app/service/agent/core/types";
import { groupModelsByProvider, supportsVision, supportsImageOutput } from "./model_utils";
import ProviderIcon from "./ProviderIcon";

// 斜杠命令弹出菜单
function SlashCommandMenu({
  items,
  activeIndex,
  onSelect,
}: {
  items: SkillSummary[];
  activeIndex: number;
  onSelect: (skill: SkillSummary) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // 保持选中项在视口内
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const active = container.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (items.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="tw-absolute tw-bottom-full tw-left-0 tw-right-0 tw-mb-1 tw-max-h-[240px] tw-overflow-y-auto tw-rounded-lg tw-border tw-border-solid tw-border-[var(--color-border-2)] tw-bg-[var(--color-bg-2)] tw-shadow-[0_4px_16px_rgba(0,0,0,0.1)] tw-z-10 tw-py-1 agent-chat-scroll"
    >
      {items.map((skill, i) => (
        <div
          key={skill.name}
          onMouseDown={(e) => {
            e.preventDefault(); // 阻止 textarea 失焦
            onSelect(skill);
          }}
          className={`tw-flex tw-flex-col tw-gap-0.5 tw-px-3 tw-py-2 tw-cursor-pointer tw-transition-colors ${
            i === activeIndex
              ? "tw-bg-[rgb(var(--arcoblue-1))] dark:tw-bg-[rgba(var(--arcoblue-6),0.1)]"
              : "hover:tw-bg-[var(--color-fill-1)]"
          }`}
        >
          <span className="tw-text-sm tw-font-medium tw-text-[var(--color-text-1)] tw-flex tw-items-center tw-gap-1.5">
            <IconThunderbolt style={{ fontSize: 13, color: "rgb(var(--arcoblue-6))", flexShrink: 0 }} />
            <span>/{skill.name}</span>
          </span>
          {skill.description && (
            <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-pl-[21px] tw-line-clamp-1">
              {skill.description}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function ModelSelect({
  models,
  selectedModelId,
  onModelChange,
}: {
  models: AgentModelConfig[];
  selectedModelId: string;
  onModelChange: (id: string) => void;
}) {
  const groups = useMemo(() => groupModelsByProvider(models), [models]);
  const hasMultipleGroups = groups.length > 1;

  const renderOption = (m: AgentModelConfig, providerKey: string) => (
    <Select.Option key={m.id} value={m.id}>
      <span className="tw-inline-flex tw-items-center tw-gap-1.5">
        {!hasMultipleGroups && <ProviderIcon providerKey={providerKey} size={12} />}
        <span>{m.name}</span>
        {supportsVision(m) && <IconEye style={{ fontSize: 12, color: "var(--color-text-4)", flexShrink: 0 }} />}
        {supportsImageOutput(m) && <IconImage style={{ fontSize: 12, color: "var(--color-text-4)", flexShrink: 0 }} />}
      </span>
    </Select.Option>
  );

  // 找到当前选中模型的供应商用于 renderFormat
  const selectedProviderKey = useMemo(() => {
    for (const g of groups) {
      if (g.models.some((m) => m.id === selectedModelId)) {
        return g.provider.key;
      }
    }
    return "other";
  }, [groups, selectedModelId]);

  return (
    <Select
      size="mini"
      value={selectedModelId}
      onChange={onModelChange}
      triggerProps={{ autoAlignPopupWidth: false }}
      getPopupContainer={() => document.body}
      className="!tw-w-auto !tw-min-w-[100px]"
      bordered={false}
      renderFormat={(_option, value) => {
        const m = models.find((model) => model.id === value);
        if (!m) return <span>-</span>;
        return (
          <span className="tw-inline-flex tw-items-center tw-gap-1.5">
            <ProviderIcon providerKey={selectedProviderKey} size={12} />
            <span>{m.name}</span>
          </span>
        );
      }}
    >
      {hasMultipleGroups
        ? groups.map((g) => (
            <Select.OptGroup
              key={g.provider.key}
              label={
                <span className="tw-inline-flex tw-items-center tw-gap-1.5">
                  <ProviderIcon providerKey={g.provider.key} size={12} />
                  <span>{g.provider.label}</span>
                </span>
              }
            >
              {g.models.map((m) => renderOption(m, g.provider.key))}
            </Select.OptGroup>
          ))
        : groups.flatMap((g) => g.models.map((m) => renderOption(m, g.provider.key)))}
    </Select>
  );
}

type PendingAttachment = {
  id: string;
  file: File;
  previewUrl: string;
};

export default function ChatInput({
  models,
  selectedModelId,
  onModelChange,
  onSend,
  onStop,
  isStreaming,
  disabled,
  skills,
  selectedSkills,
  onSkillsChange,
  enableTools,
  onEnableToolsChange,
  backgroundEnabled,
  onBackgroundEnabledChange,
  hasPendingMessage,
}: {
  models: AgentModelConfig[];
  selectedModelId: string;
  onModelChange: (id: string) => void;
  onSend: (content: MessageContent, files?: Map<string, File>) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  skills?: SkillSummary[];
  selectedSkills?: "auto" | string[];
  onSkillsChange?: (skills: "auto" | string[]) => void;
  enableTools?: boolean;
  onEnableToolsChange?: (enabled: boolean) => void;
  backgroundEnabled?: boolean;
  onBackgroundEnabledChange?: (enabled: boolean) => void;
  hasPendingMessage?: boolean;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 斜杠命令过滤
  const slashQuery = useMemo(() => {
    const match = input.match(/^\/(\S*)$/);
    return match ? match[1].toLowerCase() : null;
  }, [input]);

  const filteredSkills = useMemo(() => {
    if (slashQuery === null || !skills || skills.length === 0) return [];
    if (slashQuery === "") return skills;
    return skills.filter(
      (s) => s.name.toLowerCase().includes(slashQuery) || s.description.toLowerCase().includes(slashQuery)
    );
  }, [slashQuery, skills]);

  const showSlashMenu = filteredSkills.length > 0;

  // 重置选中索引
  useEffect(() => {
    setSlashActiveIndex(0);
  }, [filteredSkills.length]);

  // 自动调整高度
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [input]);

  // 清理 objectURLs
  useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const newAttachments = files.map((file) => {
      // 从文件名提取扩展名，fallback 到 MIME 子类型
      const ext = file.name.includes(".") ? file.name.split(".").pop() : file.type.split("/")[1] || "bin";
      return {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`,
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      };
    });
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handleSend = () => {
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0) || disabled || hasPendingMessage) return;

    if (attachments.length > 0) {
      // 构建 ContentBlock[] 和 files Map
      const blocks: ContentBlock[] = [];
      const files = new Map<string, File>();

      if (trimmed) {
        blocks.push({ type: "text", text: trimmed });
      }
      for (const att of attachments) {
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

      onSend(blocks, files);
      // 清理（不 revoke，发送后由调用方负责）
      setAttachments([]);
    } else {
      onSend(trimmed);
    }
    setInput("");
  };

  const handleSlashSelect = useCallback((skill: SkillSummary) => {
    setInput(`/${skill.name} `);
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 忽略输入法组合状态中的回车（如中文输入法确认候选词）
    if (e.nativeEvent.isComposing) return;

    // 斜杠命令菜单键盘导航
    if (showSlashMenu) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashActiveIndex((prev) => (prev <= 0 ? filteredSkills.length - 1 : prev - 1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashActiveIndex((prev) => (prev >= filteredSkills.length - 1 ? 0 : prev + 1));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSlashSelect(filteredSkills[slashActiveIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
    // reset input value so the same file can be selected again
    e.target.value = "";
  };

  const canSend = (input.trim() || attachments.length > 0) && !disabled && !hasPendingMessage;

  return (
    <div className="tw-px-4 tw-pb-4 tw-pt-2 tw-bg-[var(--color-bg-1)]">
      <div className="tw-max-w-3xl tw-mx-auto">
        <div className="tw-relative">
          {/* 斜杠命令弹出菜单 */}
          {showSlashMenu && (
            <SlashCommandMenu items={filteredSkills} activeIndex={slashActiveIndex} onSelect={handleSlashSelect} />
          )}

          <div
            className={`tw-rounded-2xl tw-border tw-border-solid tw-bg-[var(--color-bg-2)] tw-shadow-[0_2px_12px_rgba(0,0,0,0.06)] tw-overflow-hidden tw-transition-colors ${
              isDragging
                ? "tw-border-[rgb(var(--arcoblue-6))] tw-bg-[rgb(var(--arcoblue-1))]"
                : "tw-border-[var(--color-border-2)]"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* 附件预览条 */}
            {attachments.length > 0 && (
              <div className="tw-flex tw-gap-2 tw-px-4 tw-pt-3 tw-pb-1 tw-flex-wrap">
                {attachments.map((att) => (
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
                      onClick={() => removeAttachment(att.id)}
                      className="tw-absolute tw--top-1.5 tw--right-1.5 tw-w-5 tw-h-5 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-bg-[var(--color-bg-5)] tw-text-white tw-border-none tw-cursor-pointer tw-opacity-0 group-hover:tw-opacity-100 tw-transition-opacity tw-text-xs tw-leading-none"
                    >
                      <IconClose style={{ fontSize: 10 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 输入区域 */}
            <div className="tw-px-4 tw-pt-3 tw-pb-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={t("agent_chat_input_placeholder")}
                disabled={disabled}
                rows={1}
                className="tw-w-full tw-resize-none tw-border-none tw-outline-none tw-bg-transparent tw-text-sm tw-text-[var(--color-text-1)] tw-min-h-[24px] tw-max-h-[200px] placeholder:tw-text-[var(--color-text-4)]"
              />
            </div>

            {/* 隐藏的文件选择器 */}
            <input ref={fileInputRef} type="file" multiple className="tw-hidden" onChange={handleFileSelect} />

            {/* 底部工具栏 */}
            <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-pb-2">
              <div className="tw-flex tw-items-center tw-gap-2">
                <ModelSelect models={models} selectedModelId={selectedModelId} onModelChange={onModelChange} />
                {skills && skills.length > 0 && onSkillsChange && (
                  <Select
                    size="mini"
                    mode="multiple"
                    value={selectedSkills === "auto" ? ["__auto__"] : selectedSkills || []}
                    onChange={(val: string[]) => {
                      const wasAuto = selectedSkills === "auto";
                      if (!wasAuto && val.includes("__auto__")) {
                        // 切换到 auto 模式
                        onSkillsChange("auto");
                      } else if (wasAuto && val.length > 1) {
                        // 从 auto 模式选择了具体 skill，取消 auto
                        onSkillsChange(val.filter((v) => v !== "__auto__"));
                      } else {
                        onSkillsChange(val.filter((v) => v !== "__auto__"));
                      }
                    }}
                    triggerProps={{ autoAlignPopupWidth: false }}
                    getPopupContainer={() => document.body}
                    className="!tw-w-auto !tw-min-w-[80px] !tw-max-w-[200px]"
                    bordered={false}
                    placeholder="Skills"
                    allowClear
                  >
                    <Select.Option key="__auto__" value="__auto__">
                      {"Auto (all)"}
                    </Select.Option>
                    {skills.map((s) => (
                      <Select.Option key={s.name} value={s.name}>
                        {s.name}
                      </Select.Option>
                    ))}
                  </Select>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="tw-w-7 tw-h-7 tw-rounded tw-flex tw-items-center tw-justify-center tw-bg-transparent tw-border-none tw-cursor-pointer tw-text-[var(--color-text-3)] hover:tw-text-[var(--color-text-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors"
                  title={t("agent_chat_attach_file")}
                >
                  <svg
                    width="16"
                    height="16"
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
                {onEnableToolsChange && (
                  <Tooltip
                    content={
                      enableTools !== false ? t("agent_chat_tools_enabled_tip") : t("agent_chat_tools_disabled_tip")
                    }
                    mini
                  >
                    <button
                      onClick={() => {
                        const next = !enableTools;
                        onEnableToolsChange(next);
                        ArcoMessage.info(next ? t("agent_chat_tools_enabled") : t("agent_chat_tools_disabled"));
                      }}
                      className={`tw-w-7 tw-h-7 tw-rounded tw-flex tw-items-center tw-justify-center tw-bg-transparent tw-border-none tw-cursor-pointer tw-transition-colors ${
                        enableTools !== false ? "tw-text-[rgb(var(--arcoblue-6))]" : "tw-text-[var(--color-text-4)]"
                      } hover:tw-bg-[var(--color-fill-2)]`}
                    >
                      <IconTool style={{ fontSize: 16 }} />
                    </button>
                  </Tooltip>
                )}
                {onBackgroundEnabledChange && (
                  <Tooltip
                    content={
                      backgroundEnabled
                        ? t("agent_chat_background_enabled_tip")
                        : t("agent_chat_background_disabled_tip")
                    }
                    mini
                  >
                    <button
                      onClick={() => onBackgroundEnabledChange(!backgroundEnabled)}
                      className={`tw-w-7 tw-h-7 tw-rounded tw-flex tw-items-center tw-justify-center tw-bg-transparent tw-border-none tw-cursor-pointer tw-transition-colors ${
                        backgroundEnabled ? "tw-text-[rgb(var(--arcoblue-6))]" : "tw-text-[var(--color-text-4)]"
                      } hover:tw-bg-[var(--color-fill-2)]`}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </button>
                  </Tooltip>
                )}
                <span className="tw-text-xs tw-text-[var(--color-text-4)] tw-hidden sm:tw-inline">
                  {"Shift+Enter"} {t("agent_chat_newline")}
                </span>
              </div>

              <div className="tw-flex tw-items-center tw-gap-1.5">
                {isStreaming && (
                  <button
                    onClick={onStop}
                    className="tw-w-8 tw-h-8 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-bg-[rgb(var(--orange-6))] tw-text-white tw-border-none tw-cursor-pointer tw-transition-all hover:tw-opacity-80 tw-shadow-sm"
                  >
                    <IconPause style={{ fontSize: 14 }} />
                  </button>
                )}
                {(!isStreaming || canSend) && (
                  <button
                    onClick={handleSend}
                    disabled={!canSend}
                    className={`tw-w-8 tw-h-8 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-border-none tw-cursor-pointer tw-transition-all tw-shadow-sm ${
                      canSend
                        ? "tw-bg-[rgb(var(--arcoblue-6))] tw-text-white hover:tw-opacity-80"
                        : "tw-bg-[var(--color-fill-3)] tw-text-[var(--color-text-4)] tw-cursor-not-allowed"
                    }`}
                  >
                    <IconSend style={{ fontSize: 14 }} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
