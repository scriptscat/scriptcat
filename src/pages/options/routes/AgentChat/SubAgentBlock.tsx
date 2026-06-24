import { useState, useRef, useCallback } from "react";
import { IconDown, IconCheck, IconExclamationCircleFill } from "@arco-design/web-react/icon";
import type { SubAgentMessage, ToolCall } from "@App/app/service/agent/core/types";
import ToolCallBlock from "./ToolCallBlock";
import ContentBlockRenderer from "./ContentBlockRenderer";

export type { SubAgentMessage };

// 子代理完整状态（流式期间维护）
export type SubAgentState = {
  agentId: string;
  description: string;
  subAgentType?: string;
  // 已完成的消息轮次
  completedMessages: SubAgentMessage[];
  // 当前正在构建的消息
  currentContent: string;
  currentThinking: string;
  currentToolCalls: ToolCall[];
  isRunning: boolean;
  // 重试信息
  retryInfo?: { attempt: number; maxRetries: number; error: string };
  // token 用量
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
};

// 类型标签颜色映射
const TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  researcher: { text: "rgb(var(--blue-6))", bg: "rgba(var(--blue-6), 0.08)" },
  page_operator: { text: "rgb(var(--orange-6))", bg: "rgba(var(--orange-6), 0.08)" },
  general: { text: "rgb(var(--gray-6))", bg: "rgba(var(--gray-6), 0.08)" },
};

// 格式化 token 数
function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

export default function SubAgentBlock({ state }: { state: SubAgentState }) {
  const [expanded, setExpanded] = useState(false);
  // 过渡完成后切换为 maxHeight: none，避免嵌套 collapsible 高度被裁剪
  const [transitionDone, setTransitionDone] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback(() => {
    if (expanded) {
      // 收起：先恢复固定高度再触发动画
      setTransitionDone(false);
      const el = contentRef.current;
      if (el) {
        el.style.maxHeight = el.scrollHeight + "px";
        void el.offsetHeight;
        el.style.maxHeight = "0";
      }
    }
    setExpanded(!expanded);
  }, [expanded]);

  const handleTransitionEnd = useCallback(() => {
    if (expanded) {
      setTransitionDone(true);
    }
  }, [expanded]);

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

  // 展开时的高度
  const expandedMaxHeight = transitionDone ? "none" : (contentRef.current?.scrollHeight ?? 0) + "px";

  return (
    <div className="sub-agent-card tw-my-2 tw-rounded-xl tw-overflow-hidden">
      {/* 头部触发器 */}
      <div
        className="sub-agent-header tw-flex tw-items-center tw-gap-2.5 tw-px-3.5 tw-py-2.5 tw-cursor-pointer tw-select-none tw-transition-colors"
        onClick={handleToggle}
      >
        {/* 状态指示器 */}
        {state.isRunning ? (
          <span className="sub-agent-pulse" />
        ) : (
          <span className="tw-w-[18px] tw-h-[18px] tw-rounded-full tw-flex tw-items-center tw-justify-center tw-bg-[rgba(var(--green-6),0.15)]">
            <IconCheck style={{ fontSize: 10, color: "rgb(var(--green-6))" }} />
          </span>
        )}

        {/* 描述 */}
        <span className="tw-text-sm tw-font-medium tw-text-[var(--color-text-1)] tw-flex-1 tw-truncate">
          {state.description}
        </span>

        {/* token 用量 */}
        {state.usage && (state.usage.inputTokens > 0 || state.usage.outputTokens > 0) && (
          <span className="tw-text-[10px] tw-text-[var(--color-text-4)] tw-whitespace-nowrap">
            {formatTokens(state.usage.inputTokens)}→{formatTokens(state.usage.outputTokens)}
            {(state.usage.cacheReadInputTokens ?? 0) > 0 && (
              <span className="tw-text-[rgb(var(--green-6))]">
                {" "}
                C:{formatTokens(state.usage.cacheReadInputTokens!)}
              </span>
            )}
          </span>
        )}

        {/* 类型标签 */}
        {state.subAgentType && state.subAgentType !== "general" && (
          <span
            className="tw-text-[10px] tw-px-2 tw-py-0.5 tw-rounded tw-font-medium tw-tracking-wide tw-uppercase"
            style={{ color: typeStyle.text, backgroundColor: typeStyle.bg }}
          >
            {state.subAgentType}
          </span>
        )}

        {/* 展开/收起箭头 */}
        <span
          className="tw-text-[var(--color-text-4)] tw-transition-transform tw-duration-200"
          style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          <IconDown style={{ fontSize: 12 }} />
        </span>
      </div>

      {/* 展开内容 */}
      <div
        ref={contentRef}
        className="agent-collapsible-content"
        style={{
          maxHeight: expanded ? expandedMaxHeight : 0,
          opacity: expanded ? 1 : 0,
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className="sub-agent-body tw-px-3.5 tw-pb-3 tw-pt-0.5">
          {allMessages.map((msg, i) => (
            <div key={i} className="tw-mb-2 last:tw-mb-0">
              {/* Thinking */}
              {msg.thinking && (
                <div className="tw-text-xs tw-italic tw-text-[var(--color-text-3)] tw-mb-1 tw-max-h-[100px] tw-overflow-y-auto">
                  {msg.thinking}
                </div>
              )}

              {/* 文本内容 */}
              {msg.content && (
                <div className="tw-text-sm">
                  <ContentBlockRenderer content={msg.content} />
                </div>
              )}

              {/* 工具调用 */}
              {msg.toolCalls.map((tc) => (
                <ToolCallBlock key={tc.id} toolCall={tc} />
              ))}
            </div>
          ))}

          {/* 重试提示 */}
          {state.retryInfo && (
            <div className="tw-flex tw-items-center tw-gap-1.5 tw-text-xs tw-text-[rgb(var(--orange-6))] tw-py-1">
              <IconExclamationCircleFill style={{ fontSize: 12 }} />
              <span>
                {state.retryInfo.error} (retry {state.retryInfo.attempt}/{state.retryInfo.maxRetries})
              </span>
            </div>
          )}

          {/* 空状态 */}
          {allMessages.length === 0 && !state.retryInfo && state.isRunning && (
            <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-py-1">Starting...</div>
          )}
        </div>
      </div>
    </div>
  );
}
