import { useState, useRef, useEffect } from "react";
import { Select } from "@arco-design/web-react";
import { IconSend, IconPause } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import type { AgentModelConfig } from "@App/pkg/config/config";

export default function ChatInput({
  models,
  selectedModelId,
  onModelChange,
  onSend,
  onStop,
  isStreaming,
  disabled,
}: {
  models: AgentModelConfig[];
  selectedModelId: string;
  onModelChange: (id: string) => void;
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
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
