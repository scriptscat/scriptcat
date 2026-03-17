import { useState, useRef, useEffect } from "react";
import { Button, Input } from "@arco-design/web-react";
import { IconSend } from "@arco-design/web-react/icon";

export default function AskUserBlock({
  id,
  question,
  onRespond,
}: {
  id: string;
  question: string;
  onRespond: (id: string, answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<any>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!answer.trim() || submitted) return;
    setSubmitted(true);
    onRespond(id, answer.trim());
  };

  if (submitted) {
    return (
      <div className="tw-my-3 tw-px-4 tw-py-3 tw-rounded-lg tw-bg-[var(--color-fill-1)] tw-border tw-border-solid tw-border-[var(--color-border-1)]">
        <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-mb-1">Agent asked:</div>
        <div className="tw-text-sm tw-text-[var(--color-text-2)] tw-mb-2">{question}</div>
        <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-mb-1">Your answer:</div>
        <div className="tw-text-sm tw-text-[var(--color-text-1)]">{answer}</div>
      </div>
    );
  }

  return (
    <div className="tw-my-3 tw-px-4 tw-py-3 tw-rounded-lg tw-bg-[var(--color-fill-1)] tw-border tw-border-solid tw-border-[rgb(var(--arcoblue-3))]">
      <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-mb-2">Agent is asking:</div>
      <div className="tw-text-sm tw-text-[var(--color-text-1)] tw-mb-3">{question}</div>
      <div className="tw-flex tw-gap-2">
        <Input
          ref={inputRef}
          value={answer}
          onChange={setAnswer}
          onPressEnter={handleSubmit}
          placeholder="Type your response..."
          size="small"
        />
        <Button type="primary" size="small" icon={<IconSend />} onClick={handleSubmit} disabled={!answer.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
