import { useState } from "react";
import { AlertCircle, Check, ChevronDown, Loader2 } from "lucide-react";
import type { SubAgentMessage } from "@App/app/service/agent/core/types";
import { cn } from "@App/pkg/utils/cn";
import type { SubAgentState } from "./types";
import ToolCallBlock from "./ToolCallBlock";
import ContentBlockRenderer from "./ContentBlockRenderer";

// 类型标签配色
const TYPE_COLORS: Record<string, string> = {
  researcher: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
  page_operator: "text-orange-600 dark:text-orange-400 bg-orange-500/10",
  general: "text-muted-foreground bg-muted",
};

// 格式化 token 数
function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

export default function SubAgentBlock({ state }: { state: SubAgentState }) {
  const [expanded, setExpanded] = useState(false);

  // 合并所有消息（已完成 + 当前）
  const allMessages: SubAgentMessage[] = [...state.completedMessages];
  if (state.currentContent || state.currentThinking || state.currentToolCalls.length > 0) {
    allMessages.push({
      content: state.currentContent,
      thinking: state.currentThinking,
      toolCalls: state.currentToolCalls,
    });
  }

  const typeStyle = TYPE_COLORS[state.subAgentType || "general"] || TYPE_COLORS.general;

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-border bg-muted/30">
      <button
        type="button"
        data-testid="subagent-trigger"
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer select-none transition-colors hover:bg-accent text-left bg-transparent border-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span data-testid="subagent-status" data-running={state.isRunning} className="flex items-center shrink-0">
          {state.isRunning ? (
            <Loader2 className="size-[18px] text-primary animate-spin" />
          ) : (
            <span className="size-[18px] rounded-full flex items-center justify-center bg-green-500/15">
              <Check className="size-2.5 text-green-600 dark:text-green-400" />
            </span>
          )}
        </span>

        <span className="text-sm font-medium text-foreground flex-1 truncate">{state.description}</span>

        {state.usage && (state.usage.inputTokens > 0 || state.usage.outputTokens > 0) && (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {formatTokens(state.usage.inputTokens)}→{formatTokens(state.usage.outputTokens)}
            {(state.usage.cacheReadInputTokens ?? 0) > 0 && (
              <span className="text-green-600 dark:text-green-400">
                {" "}
                C:{formatTokens(state.usage.cacheReadInputTokens!)}
              </span>
            )}
          </span>
        )}

        {state.subAgentType && state.subAgentType !== "general" && (
          <span className={cn("text-[10px] px-2 py-0.5 rounded font-medium tracking-wide uppercase", typeStyle)}>
            {state.subAgentType}
          </span>
        )}

        <ChevronDown
          className={cn("size-3 text-muted-foreground transition-transform shrink-0", !expanded && "-rotate-90")}
        />
      </button>

      {expanded && (
        <div className="px-3.5 pb-3 pt-0.5">
          {allMessages.map((msg, i) => (
            <div key={i} className="mb-2 last:mb-0">
              {msg.thinking && (
                <div className="text-xs italic text-muted-foreground mb-1 max-h-[100px] overflow-y-auto">
                  {msg.thinking}
                </div>
              )}
              {msg.content && (
                <div className="text-sm">
                  <ContentBlockRenderer content={msg.content} />
                </div>
              )}
              {msg.toolCalls.map((tc) => (
                <ToolCallBlock key={tc.id} toolCall={tc} />
              ))}
            </div>
          ))}

          {state.retryInfo && (
            <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400 py-1">
              <AlertCircle className="size-3" />
              <span>
                {state.retryInfo.error} (retry {state.retryInfo.attempt}/{state.retryInfo.maxRetries})
              </span>
            </div>
          )}

          {allMessages.length === 0 && !state.retryInfo && state.isRunning && (
            <div className="text-xs text-muted-foreground py-1">Starting...</div>
          )}
        </div>
      )}
    </div>
  );
}
