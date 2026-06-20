import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  ArrowUp,
  ChevronDown,
  Clock,
  Eye,
  File as FileIcon,
  Image as ImageIcon,
  Paperclip,
  PlayCircle,
  Square,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import type { AgentModelConfig, SkillSummary, MessageContent, ContentBlock } from "@App/app/service/agent/core/types";
import { t } from "@App/locales/locales";
import { cn } from "@App/pkg/utils/cn";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@App/pages/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@App/pages/components/ui/popover";
import { Checkbox } from "@App/pages/components/ui/checkbox";
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

  useEffect(() => {
    const container = listRef.current;
    const active = container?.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  if (items.length === 0) return null;

  return (
    <div
      ref={listRef}
      data-testid="slash-menu"
      className="absolute bottom-full left-0 right-0 mb-1 max-h-[240px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg z-10 py-1"
    >
      {items.map((skill, i) => (
        <div
          key={skill.name}
          data-testid={`slash-item-${skill.name}`}
          onMouseDown={(e) => {
            e.preventDefault(); // 阻止 textarea 失焦
            onSelect(skill);
          }}
          className={cn(
            "flex flex-col gap-0.5 px-3 py-2 cursor-pointer transition-colors",
            i === activeIndex ? "bg-accent" : "hover:bg-accent/50"
          )}
        >
          <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <Zap className="size-3 text-primary shrink-0" />
            <span>{`/${skill.name}`}</span>
          </span>
          {skill.description && (
            <span className="text-xs text-muted-foreground pl-[21px] line-clamp-1">{skill.description}</span>
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

  return (
    <Select value={selectedModelId || undefined} onValueChange={onModelChange}>
      <SelectTrigger
        data-testid="agent-model-select"
        className="h-7 border-none shadow-none gap-1.5 px-2 text-xs min-w-[100px] w-auto"
      >
        <SelectValue placeholder={t("agent:chat_model_select")} />
      </SelectTrigger>
      <SelectContent>
        {groups.map((g) => (
          <SelectGroup key={g.provider.key}>
            <SelectLabel className="flex items-center gap-1.5">
              <ProviderIcon providerKey={g.provider.key} size={12} />
              <span>{g.provider.label}</span>
            </SelectLabel>
            {g.models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="inline-flex items-center gap-1.5">
                  <span>{m.name}</span>
                  {supportsVision(m) && <Eye className="size-3 text-muted-foreground shrink-0" />}
                  {supportsImageOutput(m) && <ImageIcon className="size-3 text-muted-foreground shrink-0" />}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

const AUTO = "auto";

function SkillsSelect({
  skills,
  selectedSkills,
  onSkillsChange,
}: {
  skills: SkillSummary[];
  selectedSkills?: "auto" | string[];
  onSkillsChange: (skills: "auto" | string[]) => void;
}) {
  const isAuto = selectedSkills === AUTO;
  const selectedList = isAuto ? [] : selectedSkills || [];
  const label = isAuto
    ? t("agent:tasks_skills_auto")
    : selectedList.length
      ? `${selectedList.length} Skills`
      : "Skills";

  const toggle = (name: string) => {
    const next = selectedList.includes(name) ? selectedList.filter((v) => v !== name) : [...selectedList, name];
    onSkillsChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-7 inline-flex items-center gap-1 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-none bg-transparent cursor-pointer"
        >
          <Zap className="size-3" />
          <span className="truncate max-w-[120px]">{label}</span>
          <ChevronDown className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <label className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-accent">
          <Checkbox checked={isAuto} onCheckedChange={() => onSkillsChange(AUTO)} />
          <span>{t("agent:tasks_skills_auto")}</span>
        </label>
        <div className="h-px bg-border my-1" />
        <div className="max-h-[200px] overflow-y-auto">
          {skills.map((s) => (
            <label
              key={s.name}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-accent"
            >
              <Checkbox checked={!isAuto && selectedList.includes(s.name)} onCheckedChange={() => toggle(s.name)} />
              <span className="truncate">{s.name}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type PendingAttachment = { id: string; file: File; previewUrl: string };

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

  // 卸载时清理 objectURLs
  useEffect(() => {
    return () => {
      attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const blocks: ContentBlock[] = [];
      const files = new Map<string, File>();
      if (trimmed) blocks.push({ type: "text", text: trimmed });
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
    if (e.nativeEvent.isComposing) return;

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  const canSend = !!(input.trim() || attachments.length > 0) && !disabled && !hasPendingMessage;
  const iconBtn =
    "size-7 max-md:size-11 rounded flex items-center justify-center bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent transition-colors";

  return (
    <div className="px-4 pb-4 pt-2 bg-background">
      <div className="max-w-3xl mx-auto">
        <div className="relative">
          {showSlashMenu && (
            <SlashCommandMenu items={filteredSkills} activeIndex={slashActiveIndex} onSelect={handleSlashSelect} />
          )}

          <div
            className={cn(
              "rounded-2xl border bg-card shadow-sm overflow-hidden transition-colors",
              isDragging ? "border-primary bg-primary/5" : "border-border"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={handleDrop}
          >
            {/* 附件预览条 */}
            {attachments.length > 0 && (
              <div className="flex gap-2 px-4 pt-3 pb-1 flex-wrap">
                {attachments.map((att) => (
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
                      onClick={() => removeAttachment(att.id)}
                      className="absolute -top-1.5 -right-1.5 size-5 rounded-full flex items-center justify-center bg-foreground/70 text-background border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="size-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 输入区域 */}
            <div className="px-4 pt-3 pb-2">
              <textarea
                ref={textareaRef}
                data-testid="chat-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={t("agent:chat_input_placeholder")}
                disabled={disabled}
                rows={1}
                className="w-full resize-none border-none outline-none bg-transparent text-sm text-foreground min-h-[24px] max-h-[200px] placeholder:text-muted-foreground"
              />
            </div>

            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

            {/* 底部工具栏 */}
            <div className="flex items-center justify-between px-3 pb-2 gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <ModelSelect models={models} selectedModelId={selectedModelId} onModelChange={onModelChange} />
                {skills && skills.length > 0 && onSkillsChange && (
                  <SkillsSelect skills={skills} selectedSkills={selectedSkills} onSkillsChange={onSkillsChange} />
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={iconBtn}
                  title={t("agent:chat_attach_file")}
                  aria-label={t("agent:chat_attach_file")}
                >
                  <Paperclip className="size-4" />
                </button>
                {onEnableToolsChange && (
                  <button
                    type="button"
                    title={
                      enableTools !== false ? t("agent:chat_tools_enabled_tip") : t("agent:chat_tools_disabled_tip")
                    }
                    aria-label={
                      enableTools !== false ? t("agent:chat_tools_enabled_tip") : t("agent:chat_tools_disabled_tip")
                    }
                    onClick={() => {
                      const next = !enableTools;
                      onEnableToolsChange(next);
                      toast.info(next ? t("agent:chat_tools_enabled") : t("agent:chat_tools_disabled"));
                    }}
                    className={cn(iconBtn, enableTools !== false && "text-primary hover:text-primary")}
                  >
                    <Wrench className="size-4" />
                  </button>
                )}
                {onBackgroundEnabledChange && (
                  <button
                    type="button"
                    title={
                      backgroundEnabled
                        ? t("agent:chat_background_enabled_tip")
                        : t("agent:chat_background_disabled_tip")
                    }
                    aria-label={
                      backgroundEnabled
                        ? t("agent:chat_background_enabled_tip")
                        : t("agent:chat_background_disabled_tip")
                    }
                    onClick={() => onBackgroundEnabledChange(!backgroundEnabled)}
                    className={cn(iconBtn, backgroundEnabled && "text-primary hover:text-primary")}
                  >
                    <Clock className="size-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isStreaming && (
                  <button
                    type="button"
                    data-testid="chat-stop"
                    aria-label={t("agent:chat_stop")}
                    onClick={onStop}
                    className="size-8 max-md:size-11 rounded-full flex items-center justify-center bg-warning text-warning-foreground border-none cursor-pointer transition-all hover:opacity-80 shadow-sm"
                  >
                    <Square className="size-3.5 fill-current" />
                  </button>
                )}
                {(!isStreaming || canSend) && (
                  <button
                    type="button"
                    data-testid="chat-send"
                    aria-label={t("agent:chat_send")}
                    onClick={handleSend}
                    disabled={!canSend}
                    className={cn(
                      "size-8 max-md:size-11 rounded-full flex items-center justify-center border-none transition-all shadow-sm",
                      canSend
                        ? "bg-gradient-to-br from-primary to-primary-hover text-primary-foreground cursor-pointer hover:opacity-80"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    <ArrowUp className="size-4" />
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
