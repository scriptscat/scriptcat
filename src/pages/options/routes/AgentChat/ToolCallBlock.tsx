import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { IconDown, IconRight, IconCheck, IconClose } from "@arco-design/web-react/icon";
import type { ToolCall } from "@App/app/service/agent/core/types";
import { AttachmentImage, AttachmentFile } from "./AttachmentRenderers";

// 状态图标
function StatusIcon({ status }: { status?: string }) {
  switch (status) {
    case "running":
      return <span className="agent-tool-spinner" />;
    case "completed":
      return (
        <span className="tw-w-4 tw-h-4 tw-rounded-full tw-bg-[rgb(var(--green-1))] tw-flex tw-items-center tw-justify-center">
          <IconCheck style={{ fontSize: 10, color: "rgb(var(--green-6))" }} />
        </span>
      );
    case "error":
      return (
        <span className="tw-w-4 tw-h-4 tw-rounded-full tw-bg-[rgb(var(--red-1))] tw-flex tw-items-center tw-justify-center">
          <IconClose style={{ fontSize: 10, color: "rgb(var(--red-6))" }} />
        </span>
      );
    default:
      return <span className="tw-w-3 tw-h-3 tw-rounded-full tw-bg-[var(--color-fill-3)]" />;
  }
}

export default function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  // 使用 ResizeObserver 监听内容区域尺寸变化，自动更新高度
  // 解决流式加载期间展开后 result 到达导致 max-height 不足的问题
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      setContentHeight(el.scrollHeight);
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const hasAttachments = toolCall.attachments && toolCall.attachments.length > 0;

  return (
    <div className="tw-my-2">
      {/* 触发器 */}
      <div
        className="tw-inline-flex tw-items-center tw-gap-2 tw-px-3 tw-py-1.5 tw-rounded-full tw-cursor-pointer tw-select-none tw-bg-[var(--color-fill-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors tw-border tw-border-solid tw-border-[var(--color-border-1)]"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon status={toolCall.status} />
        <span className="tw-text-xs tw-font-medium tw-text-[var(--color-text-2)]">{toolCall.name}</span>
        {expanded ? (
          <IconDown style={{ fontSize: 10 }} className="tw-text-[var(--color-text-4)]" />
        ) : (
          <IconRight style={{ fontSize: 10 }} className="tw-text-[var(--color-text-4)]" />
        )}
      </div>

      {/* 附件展示（始终可见，不需要展开） */}
      {hasAttachments && (
        <div className="tw-mt-2 tw-ml-2 tw-flex tw-flex-wrap tw-gap-2">
          {toolCall.attachments!.map((att) =>
            att.type === "image" ? (
              <AttachmentImage key={att.id} attachment={att} />
            ) : (
              <AttachmentFile key={att.id} attachment={att} />
            )
          )}
        </div>
      )}

      {/* 展开内容（参数和文本结果） */}
      <div
        className="agent-collapsible-content"
        style={{ maxHeight: expanded ? contentHeight + 32 : 0, opacity: expanded ? 1 : 0 }}
      >
        <div ref={contentRef} className="tw-mt-2 tw-ml-2">
          {/* 参数 */}
          <div className="tw-rounded-lg tw-overflow-hidden tw-border tw-border-solid tw-border-[var(--color-border-1)]">
            <div className="tw-px-3 tw-py-1.5 tw-bg-[var(--color-fill-2)] tw-text-xs tw-font-medium tw-text-[var(--color-text-3)]">
              {t("agent_chat_tool_arguments") || "Arguments"}
            </div>
            <pre className="tw-m-0 tw-px-3 tw-py-2 tw-whitespace-pre-wrap tw-break-all tw-text-xs tw-font-mono tw-text-[var(--color-text-2)] tw-bg-[var(--color-fill-1)] tw-max-h-[300px] tw-overflow-y-auto">
              {toolCall.arguments}
            </pre>
          </div>

          {/* 文本结果 */}
          {toolCall.result && (
            <div className="tw-rounded-lg tw-overflow-hidden tw-border tw-border-solid tw-border-[var(--color-border-1)] tw-mt-2">
              <div className="tw-px-3 tw-py-1.5 tw-bg-[var(--color-fill-2)] tw-text-xs tw-font-medium tw-text-[var(--color-text-3)]">
                {t("agent_chat_tool_result") || "Result"}
              </div>
              <pre className="tw-m-0 tw-px-3 tw-py-2 tw-whitespace-pre-wrap tw-break-all tw-text-xs tw-font-mono tw-text-[var(--color-text-2)] tw-bg-[var(--color-fill-1)] tw-max-h-[300px] tw-overflow-y-auto">
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
