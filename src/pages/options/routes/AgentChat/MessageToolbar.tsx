import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Popconfirm, Tooltip } from "@arco-design/web-react";
import { IconCopy, IconRefresh, IconDelete } from "@arco-design/web-react/icon";

export type MessageToolbarProps = {
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  durationMs?: number;
  firstTokenMs?: number;
  toolCallCount: number;
  isStreaming?: boolean;
  streamStartTime?: number;
  onCopy: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
};

// 格式化时长
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m${sec}s`;
}

// 格式化 token 数
function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

// 分隔点
function Dot() {
  return <span className="tw-text-[var(--color-text-3)] tw-text-xs tw-mx-1">{"·"}</span>;
}

// 流式计时器
function LiveTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(Date.now() - startTime);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(timer);
  }, [startTime]);

  return (
    <span className="tw-inline-flex tw-items-center tw-gap-1">
      <span className="agent-tool-spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
      <span>{formatDuration(elapsed)}</span>
    </span>
  );
}

// 操作按钮
function ActionButton({ tooltip, onClick, children }: { tooltip: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip content={tooltip} mini>
      <button
        className="tw-w-6 tw-h-6 tw-flex tw-items-center tw-justify-center tw-rounded tw-bg-transparent tw-border-none tw-cursor-pointer tw-text-[var(--color-text-3)] hover:tw-text-[var(--color-text-1)] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors"
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export default function MessageToolbar({
  usage,
  durationMs,
  firstTokenMs,
  toolCallCount,
  isStreaming,
  streamStartTime,
  onCopy,
  onRegenerate,
  onDelete,
}: MessageToolbarProps) {
  const { t } = useTranslation();

  // 元数据片段
  const metaParts: ReactNode[] = [];

  if (isStreaming && streamStartTime) {
    metaParts.push(
      <span key="live" className="tw-inline-flex tw-items-center">
        <LiveTimer startTime={streamStartTime} />
      </span>
    );
  } else {
    if (usage) {
      const cacheInfo =
        usage.cacheReadInputTokens || usage.cacheCreationInputTokens
          ? ` (cache R:${formatTokens(usage.cacheReadInputTokens || 0)} W:${formatTokens(usage.cacheCreationInputTokens || 0)})`
          : "";
      metaParts.push(
        <span key="tokens">
          <span style={{ color: "rgb(var(--green-5))" }}>{"↑"}</span>
          {formatTokens(usage.inputTokens)}
          {cacheInfo} <span style={{ color: "rgb(var(--red-5))" }}>{"↓"}</span>
          {formatTokens(usage.outputTokens)}
        </span>
      );
    }
    if (durationMs != null) {
      metaParts.push(<span key="dur">{formatDuration(durationMs)}</span>);
    }
    if (firstTokenMs != null) {
      metaParts.push(
        <span key="ttft">
          {t("agent_chat_first_token")} {formatDuration(firstTokenMs)}
        </span>
      );
    }
  }

  if (toolCallCount > 0) {
    metaParts.push(<span key="tools">{t("agent_chat_tools_count", { count: toolCallCount })}</span>);
  }

  return (
    <div className="tw-flex tw-items-center tw-justify-between tw-w-full tw-mt-2 tw-select-none tw-text-xs tw-text-[var(--color-text-3)] agent-message-toolbar">
      {/* 最左侧：操作按钮（hover 时显示） */}
      <div className="tw-flex tw-items-center">
        {!isStreaming && (
          <div className="agent-toolbar-actions tw-flex tw-items-center tw-opacity-0 tw-transition-opacity">
            <ActionButton tooltip={t("agent_chat_copy_message")} onClick={onCopy}>
              <IconCopy style={{ fontSize: 14 }} />
            </ActionButton>
            <ActionButton tooltip={t("agent_chat_regenerate")} onClick={onRegenerate}>
              <IconRefresh style={{ fontSize: 14 }} />
            </ActionButton>
            <Popconfirm title={t("agent_chat_delete_confirm")} onOk={onDelete} position="top">
              <Tooltip content={t("agent_chat_delete_round")} mini>
                <button className="tw-w-6 tw-h-6 tw-flex tw-items-center tw-justify-center tw-rounded tw-bg-transparent tw-border-none tw-cursor-pointer tw-text-[var(--color-text-3)] hover:tw-text-[rgb(var(--red-6))] hover:tw-bg-[var(--color-fill-2)] tw-transition-colors">
                  <IconDelete style={{ fontSize: 14 }} />
                </button>
              </Tooltip>
            </Popconfirm>
          </div>
        )}
      </div>

      {/* 最右侧：元数据信息 */}
      <div className="tw-flex tw-items-center tw-flex-wrap tw-justify-end">
        {metaParts.map((part, i) => (
          <span key={i} className="tw-inline-flex tw-items-center">
            {i > 0 && <Dot />}
            {part}
          </span>
        ))}
      </div>
    </div>
  );
}
