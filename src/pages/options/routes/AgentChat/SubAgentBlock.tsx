import { useState, useRef, useCallback } from "react";
import { IconDown, IconRight, IconCheck } from "@arco-design/web-react/icon";
import type { ToolCall } from "@App/app/service/agent/types";
import ToolCallBlock from "./ToolCallBlock";
import ContentBlockRenderer from "./ContentBlockRenderer";

// 子代理执行中的单轮消息
export type SubAgentMessage = {
  content: string;
  thinking?: string;
  toolCalls: ToolCall[];
};

// 子代理完整状态
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
};

// 类型标签颜色映射
const TYPE_COLORS: Record<string, string> = {
  researcher: "rgb(var(--blue-6))",
  page_operator: "rgb(var(--orange-6))",
  general: "rgb(var(--gray-6))",
};

const TYPE_BG_COLORS: Record<string, string> = {
  researcher: "rgb(var(--blue-1))",
  page_operator: "rgb(var(--orange-1))",
  general: "rgb(var(--gray-1))",
};

export default function SubAgentBlock({ state }: { state: SubAgentState }) {
  const [expanded, setExpanded] = useState(false);
  // 过渡完成后切换为 maxHeight: none，避免嵌套 collapsible 高度被裁剪
  const [transitionDone, setTransitionDone] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback(() => {
    if (expanded) {
      // 收起：先恢复固定高度再触发动画
      setTransitionDone(false);
      // 需要先设置当前高度，下一帧再设为 0（否则 none → 0 没有动画）
      const el = contentRef.current;
      if (el) {
        el.style.maxHeight = el.scrollHeight + "px";
        // 强制 reflow
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

  const typeColor = TYPE_COLORS[state.subAgentType || "general"] || TYPE_COLORS.general;
  const typeBgColor = TYPE_BG_COLORS[state.subAgentType || "general"] || TYPE_BG_COLORS.general;

  // 展开时的高度：过渡完成后用 none（允许子元素自由伸缩），否则用 scrollHeight 做动画
  const expandedMaxHeight = transitionDone ? "none" : (contentRef.current?.scrollHeight ?? 0) + "px";

  return (
    <div className="tw-my-2">
      {/* 触发器 */}
      <div
        className="tw-inline-flex tw-items-center tw-gap-2 tw-px-3 tw-py-1.5 tw-rounded-full tw-cursor-pointer tw-select-none tw-bg-[var(--color-fill-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors tw-border tw-border-solid tw-border-[var(--color-border-1)]"
        onClick={handleToggle}
      >
        {state.isRunning ? (
          <span className="agent-tool-spinner" />
        ) : (
          <span className="tw-w-4 tw-h-4 tw-rounded-full tw-bg-[rgb(var(--green-1))] tw-flex tw-items-center tw-justify-center">
            <IconCheck style={{ fontSize: 10, color: "rgb(var(--green-6))" }} />
          </span>
        )}
        <span className="tw-text-xs tw-font-medium tw-text-[var(--color-text-2)]">
          Sub-agent: {state.description}
        </span>
        {/* 类型标签 */}
        {state.subAgentType && state.subAgentType !== "general" && (
          <span
            className="tw-text-[10px] tw-px-1.5 tw-py-0.5 tw-rounded-full tw-font-medium"
            style={{ color: typeColor, backgroundColor: typeBgColor }}
          >
            {state.subAgentType}
          </span>
        )}
        {expanded ? (
          <IconDown style={{ fontSize: 10 }} className="tw-text-[var(--color-text-4)]" />
        ) : (
          <IconRight style={{ fontSize: 10 }} className="tw-text-[var(--color-text-4)]" />
        )}
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
        <div className="tw-mt-2 tw-ml-4 tw-pl-3 tw-border-l-2 tw-border-solid tw-border-[var(--color-border-2)]">
          {allMessages.map((msg, i) => (
            <div key={i} className="tw-mb-2">
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

              {/* 工具调用（每个 ToolCallBlock 自带展开/收缩） */}
              {msg.toolCalls.map((tc) => (
                <ToolCallBlock key={tc.id} toolCall={tc} />
              ))}
            </div>
          ))}

          {/* 无内容时的空状态 */}
          {allMessages.length === 0 && state.isRunning && (
            <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-py-1">Starting...</div>
          )}
        </div>
      </div>
    </div>
  );
}
