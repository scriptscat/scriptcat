import { useState, useRef, useEffect } from "react";
import { Button, Select } from "@arco-design/web-react";
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

  return (
    <div className="tw-border-t tw-border-solid tw-border-[var(--color-border-2)] tw-border-x-0 tw-border-b-0 tw-bg-[var(--color-bg-1)] tw-px-4 tw-py-3">
      <div className="tw-max-w-3xl tw-mx-auto">
        <div className="tw-flex tw-items-end tw-gap-2 tw-rounded-xl tw-border tw-border-solid tw-border-[var(--color-border-2)] tw-bg-[var(--color-bg-2)] tw-px-3 tw-py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("agent_chat_input_placeholder")}
            disabled={disabled}
            rows={1}
            className="tw-flex-1 tw-resize-none tw-border-none tw-outline-none tw-bg-transparent tw-text-sm tw-text-[var(--color-text-1)] tw-py-1 tw-min-h-[24px] tw-max-h-[200px] placeholder:tw-text-[var(--color-text-4)]"
          />
          <div className="tw-flex tw-items-center tw-gap-1.5 tw-shrink-0">
            <Select
              size="mini"
              value={selectedModelId}
              onChange={onModelChange}
              triggerProps={{ autoAlignPopupWidth: false }}
              className="!tw-w-auto !tw-min-w-[100px]"
            >
              {models.map((m) => (
                <Select.Option key={m.id} value={m.id}>
                  {m.name}
                </Select.Option>
              ))}
            </Select>
            {isStreaming ? (
              <Button type="primary" status="warning" size="mini" icon={<IconPause />} onClick={onStop}>
                {t("agent_chat_stop")}
              </Button>
            ) : (
              <Button
                type="primary"
                size="mini"
                icon={<IconSend />}
                onClick={handleSend}
                disabled={!input.trim() || disabled}
              >
                {t("agent_chat_send")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
