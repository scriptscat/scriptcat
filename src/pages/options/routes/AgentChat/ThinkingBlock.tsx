import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { IconDown, IconRight } from "@arco-design/web-react/icon";
import MarkdownRenderer from "./MarkdownRenderer";

export default function ThinkingBlock({ content }: { content: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [content, expanded]);

  if (!content) return null;

  return (
    <div className="tw-my-3">
      {/* 触发器 */}
      <div
        className="tw-inline-flex tw-items-center tw-gap-1.5 tw-cursor-pointer tw-select-none tw-group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="tw-w-5 tw-h-5 tw-rounded-full tw-flex tw-items-center tw-justify-center tw-bg-[var(--color-fill-2)] group-hover:tw-bg-[var(--color-fill-3)] tw-transition-colors">
          {expanded ? (
            <IconDown style={{ fontSize: 10 }} className="tw-text-[var(--color-text-3)]" />
          ) : (
            <IconRight style={{ fontSize: 10 }} className="tw-text-[var(--color-text-3)]" />
          )}
        </div>
        <span className="tw-text-xs tw-text-[var(--color-text-3)] group-hover:tw-text-[var(--color-text-2)] tw-transition-colors tw-italic">
          {t("agent_chat_thinking")}
        </span>
      </div>

      {/* 内容区域 */}
      <div
        className="agent-collapsible-content"
        style={{ maxHeight: expanded ? contentHeight + 32 : 0, opacity: expanded ? 1 : 0 }}
      >
        <div
          ref={contentRef}
          className="tw-mt-2 tw-pl-4 tw-border-l-2 tw-border-solid tw-border-[var(--color-border-2)] tw-border-t-0 tw-border-r-0 tw-border-b-0 tw-text-sm tw-text-[var(--color-text-3)]"
        >
          <MarkdownRenderer content={content} />
        </div>
      </div>
    </div>
  );
}
