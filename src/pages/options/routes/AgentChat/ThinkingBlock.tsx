import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IconDown, IconRight } from "@arco-design/web-react/icon";
import MarkdownRenderer from "./MarkdownRenderer";

export default function ThinkingBlock({ content }: { content: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  return (
    <div className="tw-my-2 tw-rounded-lg tw-border tw-border-solid tw-border-[var(--color-border-2)] tw-overflow-hidden">
      <div
        className="tw-flex tw-items-center tw-gap-2 tw-px-3 tw-py-2 tw-cursor-pointer tw-bg-[var(--color-fill-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors tw-select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <IconDown className="tw-text-xs tw-text-[var(--color-text-3)]" />
        ) : (
          <IconRight className="tw-text-xs tw-text-[var(--color-text-3)]" />
        )}
        <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-font-medium">{t("agent_chat_thinking")}</span>
      </div>
      {expanded && (
        <div className="tw-px-3 tw-py-2 tw-text-sm tw-text-[var(--color-text-3)] tw-bg-[var(--color-fill-1)] tw-border-t tw-border-solid tw-border-[var(--color-border-2)] tw-border-x-0 tw-border-b-0">
          <MarkdownRenderer content={content} />
        </div>
      )}
    </div>
  );
}
