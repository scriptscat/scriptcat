import { useState, useRef, useEffect } from "react";
import { IconSend, IconCheckCircleFill, IconCheck } from "@arco-design/web-react/icon";

export default function AskUserBlock({
  id,
  question,
  options,
  multiple,
  onRespond,
}: {
  id: string;
  question: string;
  options?: string[];
  multiple?: boolean;
  onRespond: (id: string, answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (submitted) return;
    if (!answer.trim()) return;
    setSubmitted(true);
    onRespond(id, answer.trim());
  };

  // 单选：点击选项直接提交
  const handleSingleSelect = (value: string) => {
    if (submitted) return;
    setSelectedOptions([value]);
    setAnswer(value);
    setSubmitted(true);
    onRespond(id, value);
  };

  // 多选：切换选中状态
  const handleMultiToggle = (value: string) => {
    if (submitted) return;
    setSelectedOptions((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  // 多选：确认提交
  const handleMultiSubmit = () => {
    if (submitted || selectedOptions.length === 0) return;
    const result = JSON.stringify(selectedOptions);
    setAnswer(result);
    setSubmitted(true);
    onRespond(id, result);
  };

  const displayAnswer = (() => {
    if (!answer) return "";
    // 多选时尝试解析为数组展示
    if (multiple) {
      try {
        const arr = JSON.parse(answer);
        if (Array.isArray(arr)) return arr.join(", ");
      } catch {
        // 用户自行输入的文本
      }
    }
    return answer;
  })();

  const hasOptions = options && options.length > 0;

  // 已提交：紧凑的完成状态
  if (submitted) {
    return (
      <div className="agent-message-item tw-my-4">
        <div className="tw-flex tw-items-start tw-gap-3 tw-px-4 tw-py-3 tw-rounded-xl tw-bg-[var(--color-fill-1)] tw-border tw-border-solid tw-border-[var(--color-border-1)]">
          <IconCheckCircleFill
            className="tw-shrink-0 tw-mt-0.5"
            style={{ fontSize: 18, color: "rgb(var(--green-6))" }}
          />
          <div className="tw-min-w-0 tw-flex-1">
            <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-mb-1">{question}</div>
            <div className="tw-text-sm tw-text-[var(--color-text-1)] tw-font-medium">{displayAnswer}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-message-item tw-my-4">
      <div className="agent-ask-user-card tw-rounded-xl tw-overflow-hidden tw-border tw-border-solid">
        {/* 顶部渐变条 */}
        <div className="tw-h-[3px] tw-bg-gradient-to-r tw-from-[rgb(var(--arcoblue-6))] tw-via-[rgb(var(--arcoblue-4))] tw-to-[rgb(var(--arcoblue-2))]" />

        <div className="tw-bg-[var(--color-bg-2)] tw-p-4">
          {/* 问题 */}
          <div className="tw-flex tw-items-start tw-gap-2.5 tw-mb-4">
            <div className="tw-w-6 tw-h-6 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-shrink-0 tw-bg-gradient-to-br tw-from-[rgb(var(--arcoblue-5))] tw-to-[rgb(var(--arcoblue-6))] tw-text-white">
              <span className="tw-text-xs tw-font-bold">?</span>
            </div>
            <div className="tw-text-sm tw-text-[var(--color-text-1)] tw-leading-relaxed tw-pt-0.5 tw-whitespace-pre-wrap">
              {question}
            </div>
          </div>

          {/* 选项区域 */}
          {hasOptions && (
            <div className="tw-flex tw-flex-wrap tw-gap-2 tw-mb-4">
              {options.map((opt) => {
                const isSelected = selectedOptions.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => (multiple ? handleMultiToggle(opt) : handleSingleSelect(opt))}
                    className={`agent-ask-option tw-inline-flex tw-items-center tw-gap-1.5 tw-px-3.5 tw-py-2 tw-rounded-lg tw-text-sm tw-border tw-border-solid tw-cursor-pointer tw-transition-all tw-duration-150 tw-select-none ${
                      isSelected
                        ? "selected tw-font-medium tw-shadow-sm"
                        : "tw-bg-[var(--color-bg-1)] tw-text-[var(--color-text-2)]"
                    }`}
                  >
                    {multiple && (
                      <span
                        className={`tw-inline-flex tw-items-center tw-justify-center tw-w-4 tw-h-4 tw-rounded tw-border tw-border-solid tw-text-xs tw-transition-colors ${
                          isSelected
                            ? "tw-bg-[rgb(var(--arcoblue-6))] tw-border-[rgb(var(--arcoblue-6))] tw-text-white"
                            : "tw-border-[var(--color-border-3)] tw-bg-transparent"
                        }`}
                      >
                        {isSelected && <IconCheck style={{ fontSize: 10 }} />}
                      </span>
                    )}
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {/* 多选确认按钮 */}
          {hasOptions && multiple && selectedOptions.length > 0 && (
            <div className="tw-mb-4">
              <button
                type="button"
                onClick={handleMultiSubmit}
                className="tw-px-4 tw-py-1.5 tw-rounded-lg tw-text-xs tw-font-medium tw-border-none tw-bg-[rgb(var(--arcoblue-6))] tw-text-white tw-cursor-pointer hover:tw-bg-[rgb(var(--arcoblue-5))] tw-transition-colors tw-shadow-sm"
              >
                Confirm ({selectedOptions.length})
              </button>
            </div>
          )}

          {/* 文本输入 */}
          <div className="tw-flex tw-items-center tw-gap-2 tw-rounded-xl tw-bg-[var(--color-fill-1)] tw-pl-3.5 tw-pr-1.5 tw-py-1.5 tw-border tw-border-solid tw-border-[var(--color-border-1)] focus-within:tw-border-[rgb(var(--arcoblue-5))] tw-transition-colors">
            <input
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={hasOptions ? "Or type a custom response..." : "Type your response..."}
              className="tw-flex-1 tw-bg-transparent tw-border-none tw-outline-none tw-text-sm tw-text-[var(--color-text-1)] placeholder:tw-text-[var(--color-text-4)] tw-min-w-0"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!answer.trim()}
              className={`tw-w-7 tw-h-7 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-border-none tw-cursor-pointer tw-transition-all tw-shrink-0 ${
                answer.trim()
                  ? "tw-bg-[rgb(var(--arcoblue-6))] tw-text-white hover:tw-opacity-80 tw-shadow-sm"
                  : "tw-bg-[var(--color-fill-2)] tw-text-[var(--color-text-4)] tw-cursor-not-allowed"
              }`}
            >
              <IconSend style={{ fontSize: 14 }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
