import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import type { ToolCall } from "@App/app/service/agent/core/types";
import { t } from "@App/locales/locales";
import { AttachmentImage, AttachmentFile } from "./AttachmentRenderers";

// 状态指示器
function StatusIcon({ status }: { status?: string }) {
  let inner: React.ReactNode;
  switch (status) {
    case "running":
      inner = <Loader2 className="size-3.5 animate-spin text-primary" />;
      break;
    case "completed":
      inner = (
        <span className="size-4 rounded-full bg-success/15 flex items-center justify-center">
          <Check className="size-2.5 text-success" />
        </span>
      );
      break;
    case "error":
      inner = (
        <span className="size-4 rounded-full bg-destructive/15 flex items-center justify-center">
          <X className="size-2.5 text-destructive" />
        </span>
      );
      break;
    default:
      inner = <span className="size-2.5 rounded-full bg-muted-foreground/40" />;
  }
  return (
    <span data-testid="toolcall-status" data-status={status ?? "pending"} className="flex items-center justify-center">
      {inner}
    </span>
  );
}

export default function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const hasAttachments = toolCall.attachments && toolCall.attachments.length > 0;

  return (
    <div className="my-2">
      <button
        type="button"
        data-testid="toolcall-trigger"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer select-none bg-card hover:bg-accent transition-colors border border-border"
        onClick={() => setExpanded((v) => !v)}
      >
        <StatusIcon status={toolCall.status} />
        <span className="text-xs font-mono font-medium text-foreground">{toolCall.name}</span>
        {expanded ? (
          <ChevronDown className="size-2.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-2.5 text-muted-foreground" />
        )}
      </button>

      {/* 附件展示（始终可见） */}
      {hasAttachments && (
        <div className="mt-2 ml-2 flex flex-wrap gap-2">
          {toolCall.attachments!.map((att) =>
            att.type === "image" ? (
              <AttachmentImage key={att.id} attachment={att} />
            ) : (
              <AttachmentFile key={att.id} attachment={att} />
            )
          )}
        </div>
      )}

      {/* 展开内容（参数与文本结果） */}
      {expanded && (
        <div className="mt-2 ml-2">
          {/* 参数 */}
          <div className="rounded-lg overflow-hidden border border-border">
            <div className="px-3 py-1.5 bg-muted text-xs font-medium text-muted-foreground">
              {t("agent:chat_tool_arguments")}
            </div>
            <pre className="m-0 px-3 py-2 whitespace-pre-wrap break-all text-xs font-mono text-foreground bg-muted/40 max-h-[300px] overflow-y-auto">
              {toolCall.arguments}
            </pre>
          </div>

          {/* 文本结果 */}
          {toolCall.result && (
            <div className="rounded-lg overflow-hidden border border-border mt-2">
              <div className="px-3 py-1.5 bg-muted text-xs font-medium text-muted-foreground">
                {t("agent:chat_tool_result")}
              </div>
              <pre className="m-0 px-3 py-2 whitespace-pre-wrap break-all text-xs font-mono text-foreground bg-muted/40 max-h-[300px] overflow-y-auto">
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
