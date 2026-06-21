import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";

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

function Dot() {
  return <span className="text-muted-foreground text-xs mx-1">{"·"}</span>;
}

// 流式计时器
function LiveTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startTime);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startTime), 100);
    return () => clearInterval(timer);
  }, [startTime]);

  return <span className="inline-flex items-center gap-1">{formatDuration(elapsed)}</span>;
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
  const metaParts: ReactNode[] = [];

  if (isStreaming && streamStartTime) {
    metaParts.push(
      <span key="live" className="inline-flex items-center">
        <LiveTimer startTime={streamStartTime} />
      </span>
    );
  } else {
    if (usage) {
      const cacheInfo =
        usage.cacheReadInputTokens || usage.cacheCreationInputTokens
          ? ` (cache R:${formatTokens(usage.cacheReadInputTokens || 0)} W:${formatTokens(
              usage.cacheCreationInputTokens || 0
            )})`
          : "";
      metaParts.push(
        <span key="tokens">
          <span className="text-success">{"↑"}</span>
          {formatTokens(usage.inputTokens)}
          {cacheInfo} <span className="text-destructive">{"↓"}</span>
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
          {t("agent:chat_first_token")} {formatDuration(firstTokenMs)}
        </span>
      );
    }
  }

  if (toolCallCount > 0) {
    metaParts.push(<span key="tools">{t("agent:chat_tools_count", { count: toolCallCount })}</span>);
  }

  const actionBtn =
    "size-6 max-md:size-11 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent transition-colors";

  return (
    <div className="flex items-center justify-between w-full mt-2 select-none text-xs text-muted-foreground group/toolbar">
      <div className="flex items-center">
        {!isStreaming && (
          <div className="flex items-center opacity-0 group-hover/toolbar:opacity-100 transition-opacity">
            <button
              type="button"
              data-testid="toolbar-copy"
              className={actionBtn}
              title={t("agent:chat_copy_message")}
              aria-label={t("agent:chat_copy_message")}
              onClick={onCopy}
            >
              <Copy className="size-3.5" />
            </button>
            <button
              type="button"
              data-testid="toolbar-regenerate"
              className={actionBtn}
              title={t("agent:chat_regenerate")}
              aria-label={t("agent:chat_regenerate")}
              onClick={onRegenerate}
            >
              <RefreshCw className="size-3.5" />
            </button>
            <Popconfirm
              description={t("agent:chat_delete_round")}
              confirmText={t("common:confirm")}
              destructive
              onConfirm={onDelete}
            >
              <button
                type="button"
                data-testid="toolbar-delete"
                className="size-6 max-md:size-11 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                title={t("agent:chat_delete_round")}
                aria-label={t("agent:chat_delete_round")}
              >
                <Trash2 className="size-3.5" />
              </button>
            </Popconfirm>
          </div>
        )}
      </div>

      <div data-testid="toolbar-meta" className="flex items-center flex-wrap justify-end">
        {metaParts.map((part, i) => (
          <span key={i} className="inline-flex items-center">
            {i > 0 && <Dot />}
            {part}
          </span>
        ))}
      </div>
    </div>
  );
}
