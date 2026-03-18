import { useState } from "react";
import { IconDown, IconRight } from "@arco-design/web-react/icon";

export default function SubAgentBlock({
  agentId: _agentId,
  description,
  content,
  isRunning,
}: {
  agentId: string;
  description: string;
  content: string;
  isRunning: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="tw-my-2">
      <div
        className="tw-inline-flex tw-items-center tw-gap-2 tw-px-3 tw-py-1.5 tw-rounded-full tw-cursor-pointer tw-select-none tw-bg-[var(--color-fill-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors tw-border tw-border-solid tw-border-[var(--color-border-1)]"
        onClick={() => setExpanded(!expanded)}
      >
        {isRunning ? (
          <span className="agent-tool-spinner" />
        ) : (
          <span className="tw-w-4 tw-h-4 tw-rounded-full tw-bg-[rgb(var(--green-1))] tw-flex tw-items-center tw-justify-center">
            <span className="tw-w-2 tw-h-2 tw-rounded-full tw-bg-[rgb(var(--green-6))]" />
          </span>
        )}
        <span className="tw-text-xs tw-font-medium tw-text-[var(--color-text-2)]">Sub-agent: {description}</span>
        {expanded ? (
          <IconDown style={{ fontSize: 10 }} className="tw-text-[var(--color-text-4)]" />
        ) : (
          <IconRight style={{ fontSize: 10 }} className="tw-text-[var(--color-text-4)]" />
        )}
      </div>

      {expanded && content && (
        <div className="tw-mt-2 tw-ml-2 tw-rounded-lg tw-overflow-hidden tw-border tw-border-solid tw-border-[var(--color-border-1)]">
          <div className="tw-px-3 tw-py-1.5 tw-bg-[var(--color-fill-2)] tw-text-xs tw-font-medium tw-text-[var(--color-text-3)]">
            Sub-agent output
          </div>
          <pre className="tw-m-0 tw-px-3 tw-py-2 tw-whitespace-pre-wrap tw-break-all tw-text-xs tw-font-mono tw-text-[var(--color-text-2)] tw-bg-[var(--color-fill-1)] tw-max-h-[300px] tw-overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
