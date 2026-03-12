import { useState, useRef, useEffect } from "react";
import { Select } from "@arco-design/web-react";
import { IconSend, IconPause } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import type { AgentModelConfig, SkillSummary } from "@App/app/service/agent/types";

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
}: {
  models: AgentModelConfig[];
  selectedModelId: string;
  onModelChange: (id: string) => void;
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  skills?: SkillSummary[];
  selectedSkills?: "auto" | string[];
  onSkillsChange?: (skills: "auto" | string[]) => void;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整高度
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [input]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = input.trim() && !disabled;

  return (
    <div className="tw-px-4 tw-pb-4 tw-pt-2 tw-bg-[var(--color-bg-1)]">
      <div className="tw-max-w-3xl tw-mx-auto">
        <div className="tw-rounded-2xl tw-border tw-border-solid tw-border-[var(--color-border-2)] tw-bg-[var(--color-bg-2)] tw-shadow-[0_2px_12px_rgba(0,0,0,0.06)] tw-overflow-hidden">
          {/* 输入区域 */}
          <div className="tw-px-4 tw-pt-3 tw-pb-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("agent_chat_input_placeholder")}
              disabled={disabled}
              rows={1}
              className="tw-w-full tw-resize-none tw-border-none tw-outline-none tw-bg-transparent tw-text-sm tw-text-[var(--color-text-1)] tw-min-h-[24px] tw-max-h-[200px] placeholder:tw-text-[var(--color-text-4)]"
            />
          </div>

          {/* 底部工具栏 */}
          <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-pb-2">
            <div className="tw-flex tw-items-center tw-gap-2">
              <Select
                size="mini"
                value={selectedModelId}
                onChange={onModelChange}
                triggerProps={{ autoAlignPopupWidth: false }}
                className="!tw-w-auto !tw-min-w-[100px]"
                bordered={false}
              >
                {models.map((m) => (
                  <Select.Option key={m.id} value={m.id}>
                    {m.name}
                  </Select.Option>
                ))}
              </Select>
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
              <span className="tw-text-xs tw-text-[var(--color-text-4)] tw-hidden sm:tw-inline">
                {"Shift+Enter"} {t("agent_chat_newline")}
              </span>
            </div>

            {isStreaming ? (
              <button
                onClick={onStop}
                className="tw-w-8 tw-h-8 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-bg-[rgb(var(--orange-6))] tw-text-white tw-border-none tw-cursor-pointer tw-transition-all hover:tw-opacity-80 tw-shadow-sm"
              >
                <IconPause style={{ fontSize: 14 }} />
              </button>
            ) : (
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
  );
}
