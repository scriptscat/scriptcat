import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IconDown, IconRight } from "@arco-design/web-react/icon";
import { Tag } from "@arco-design/web-react";
import type { ToolCall } from "@App/app/service/agent/types";

const statusColorMap: Record<string, string> = {
  pending: "gray",
  running: "arcoblue",
  completed: "green",
  error: "red",
};

export default function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

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
        <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-font-medium">{t("agent_chat_tool_call")}</span>
        <Tag size="small" color={statusColorMap[toolCall.status || "pending"]}>
          {toolCall.name}
        </Tag>
      </div>
      {expanded && (
        <div className="tw-px-3 tw-py-2 tw-text-xs tw-font-mono tw-bg-[var(--color-fill-1)] tw-border-t tw-border-solid tw-border-[var(--color-border-2)] tw-border-x-0 tw-border-b-0">
          <div className="tw-text-[var(--color-text-3)] tw-mb-1">{"Arguments:"}</div>
          <pre className="tw-whitespace-pre-wrap tw-break-all tw-m-0 tw-text-[var(--color-text-2)]">
            {toolCall.arguments}
          </pre>
          {toolCall.result && (
            <>
              <div className="tw-text-[var(--color-text-3)] tw-mt-2 tw-mb-1">{"Result:"}</div>
              <pre className="tw-whitespace-pre-wrap tw-break-all tw-m-0 tw-text-[var(--color-text-2)]">
                {toolCall.result}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
