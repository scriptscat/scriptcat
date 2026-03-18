import { useState, useRef, useEffect } from "react";
import { Button, Input, Radio, Checkbox } from "@arco-design/web-react";
import { IconSend } from "@arco-design/web-react/icon";

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
  const inputRef = useRef<any>(null);

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

  if (submitted) {
    return (
      <div className="tw-my-3 tw-px-4 tw-py-3 tw-rounded-lg tw-bg-[var(--color-fill-1)] tw-border tw-border-solid tw-border-[var(--color-border-1)]">
        <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-mb-1">Agent asked:</div>
        <div className="tw-text-sm tw-text-[var(--color-text-2)] tw-mb-2">{question}</div>
        <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-mb-1">Your answer:</div>
        <div className="tw-text-sm tw-text-[var(--color-text-1)]">{displayAnswer}</div>
      </div>
    );
  }

  const hasOptions = options && options.length > 0;

  return (
    <div className="tw-my-3 tw-px-4 tw-py-3 tw-rounded-lg tw-bg-[var(--color-fill-1)] tw-border tw-border-solid tw-border-[rgb(var(--arcoblue-3))]">
      <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-mb-2">Agent is asking:</div>
      <div className="tw-text-sm tw-text-[var(--color-text-1)] tw-mb-3">{question}</div>

      {/* 选项区域 */}
      {hasOptions && !multiple && (
        <div className="tw-mb-3">
          <Radio.Group direction="vertical">
            {options.map((opt) => (
              <Radio key={opt} value={opt} onClick={() => handleSingleSelect(opt)}>
                {opt}
              </Radio>
            ))}
          </Radio.Group>
        </div>
      )}

      {hasOptions && multiple && (
        <div className="tw-mb-3">
          <Checkbox.Group
            direction="vertical"
            value={selectedOptions}
            onChange={(values) => setSelectedOptions(values as string[])}
          >
            {options.map((opt) => (
              <Checkbox key={opt} value={opt}>
                {opt}
              </Checkbox>
            ))}
          </Checkbox.Group>
          <div className="tw-mt-2">
            <Button type="primary" size="small" onClick={handleMultiSubmit} disabled={selectedOptions.length === 0}>
              Confirm
            </Button>
          </div>
        </div>
      )}

      {/* 文本输入框（始终显示） */}
      <div className="tw-flex tw-gap-2">
        <Input
          ref={inputRef}
          value={answer}
          onChange={setAnswer}
          onPressEnter={handleSubmit}
          placeholder={hasOptions ? "Or type a custom response..." : "Type your response..."}
          size="small"
        />
        <Button type="primary" size="small" icon={<IconSend />} onClick={handleSubmit} disabled={!answer.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
