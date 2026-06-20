import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import MarkdownRenderer from "./MarkdownRenderer";

export default function ThinkingBlock({ content }: { content: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  return (
    <div className="my-3">
      <button
        type="button"
        data-testid="thinking-trigger"
        className="inline-flex items-center gap-1.5 cursor-pointer select-none group bg-transparent border-none p-0"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="size-5 rounded-full flex items-center justify-center bg-muted group-hover:bg-accent transition-colors">
          {expanded ? (
            <ChevronDown className="size-2.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-2.5 text-muted-foreground" />
          )}
        </span>
        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors italic">
          {t("agent:chat_thinking")}
        </span>
      </button>

      {expanded && (
        <div className={cn("mt-2 pl-4 border-l-2 border-border text-sm text-muted-foreground")}>
          <MarkdownRenderer content={content} />
        </div>
      )}
    </div>
  );
}
