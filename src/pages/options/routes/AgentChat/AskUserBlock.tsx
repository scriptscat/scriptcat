import { useState, useRef, useEffect } from "react";
import { Check, CheckCircle2, Send } from "lucide-react";
import { t } from "@App/locales/locales";
import { cn } from "@App/pkg/utils/cn";

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
    if (submitted || !answer.trim()) return;
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
      <div className="my-4">
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-muted/50 border border-border">
          <CheckCircle2 className="size-[18px] shrink-0 mt-0.5 text-success" />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground mb-1">{question}</div>
            <div className="text-sm text-foreground font-medium">{displayAnswer}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4">
      <div className="rounded-xl overflow-hidden border border-border">
        {/* 顶部渐变条 */}
        <div className="h-[3px] bg-gradient-to-r from-primary via-primary/60 to-primary/20" />

        <div className="bg-card p-4">
          {/* 问题 */}
          <div className="flex items-start gap-2.5 mb-4">
            <div className="size-6 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-primary to-primary-hover text-primary-foreground">
              <span className="text-xs font-bold">{"?"}</span>
            </div>
            <div className="text-sm text-foreground leading-relaxed pt-0.5 whitespace-pre-wrap">{question}</div>
          </div>

          {/* 选项 */}
          {hasOptions && (
            <div className="flex flex-wrap gap-2 mb-4">
              {options.map((opt) => {
                const isSelected = selectedOptions.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    data-testid={`ask-option-${opt}`}
                    onClick={() => (multiple ? handleMultiToggle(opt) : handleSingleSelect(opt))}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm border cursor-pointer transition-all select-none",
                      isSelected
                        ? "border-primary bg-primary-light text-primary font-medium shadow-sm"
                        : "border-border bg-background text-foreground/80 hover:bg-accent"
                    )}
                  >
                    {multiple && (
                      <span
                        className={cn(
                          "inline-flex items-center justify-center size-4 rounded border text-xs transition-colors",
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border bg-transparent"
                        )}
                      >
                        {isSelected && <Check className="size-2.5" />}
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
            <div className="mb-4">
              <button
                type="button"
                data-testid="ask-confirm"
                onClick={handleMultiSubmit}
                className="px-4 py-1.5 rounded-lg text-xs font-medium border-none bg-primary text-primary-foreground cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
              >
                {t("common:confirm")} {`(${selectedOptions.length})`}
              </button>
            </div>
          )}

          {/* 文本输入 */}
          <div className="flex items-center gap-2 rounded-xl bg-muted/50 pl-3.5 pr-1.5 py-1.5 border border-border focus-within:border-primary transition-colors">
            <input
              ref={inputRef}
              data-testid="ask-input"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={t("agent:chat_input_placeholder")}
              className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground min-w-0"
            />
            <button
              type="button"
              data-testid="ask-send"
              aria-label={t("agent:chat_send")}
              onClick={handleSubmit}
              disabled={!answer.trim()}
              className={cn(
                "size-7 rounded-full flex items-center justify-center border-none transition-all shrink-0",
                answer.trim()
                  ? "bg-primary text-primary-foreground cursor-pointer hover:opacity-80 shadow-sm"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              <Send className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
