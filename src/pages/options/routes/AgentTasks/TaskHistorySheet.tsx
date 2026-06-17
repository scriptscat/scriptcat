import { useTranslation } from "react-i18next";
import { Loader2, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@App/pages/components/ui/sheet";
import { Button } from "@App/pages/components/ui/button";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import type { AgentTask, AgentTaskRun } from "@App/app/service/agent/core/types";
import { StatusDot } from "../_agent/tags";

function durationText(run: AgentTaskRun): string {
  if (!run.endtime) return "—";
  return `${((run.endtime - run.starttime) / 1000).toFixed(1)}s`;
}

function usageText(run: AgentTaskRun): string {
  if (!run.usage) return "—";
  return `${run.usage.inputTokens}+${run.usage.outputTokens}`;
}

export function TaskHistorySheet({
  open,
  task,
  runs,
  loading,
  onClear,
  onOpenChange,
}: {
  open: boolean;
  task: AgentTask | null;
  runs: AgentTaskRun[];
  loading: boolean;
  onClear: () => void;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation(["agent", "common"]);

  const statusInfo = (status: AgentTaskRun["status"]) => {
    if (status === "success") return { tone: "success" as const, label: t("agent:tasks_run_status_success") };
    if (status === "error") return { tone: "error" as const, label: t("agent:tasks_run_status_error") };
    return { tone: "muted" as const, label: t("agent:tasks_run_status_running") };
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="truncate">{task?.name}</SheetTitle>
          <SheetDescription>{t("agent:tasks_history")}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div
              data-testid="history-loading"
              className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              {t("agent:mcp_loading")}
            </div>
          ) : runs.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              {t("agent:tasks_no_runs")}
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center gap-3 border-b border-border px-5 py-2 text-xs font-medium text-muted-foreground">
                <span className="flex-1">{t("agent:tasks_run_time")}</span>
                <span className="w-16">{t("agent:tasks_run_status")}</span>
                <span className="w-16 text-right">{t("agent:tasks_run_duration")}</span>
                <span className="w-20 text-right">{t("agent:tasks_run_usage")}</span>
              </div>
              {runs.map((run) => {
                const info = statusInfo(run.status);
                return (
                  <div key={run.id} className="flex items-center gap-3 border-b border-border px-5 py-2.5 text-xs">
                    <span className="flex-1 font-mono text-muted-foreground">
                      {formatUnixTime(Math.floor(run.starttime / 1000))}
                    </span>
                    <span className="w-16">
                      <StatusDot tone={info.tone}>{info.label}</StatusDot>
                    </span>
                    <span className="w-16 text-right font-mono text-muted-foreground">{durationText(run)}</span>
                    <span className="w-20 text-right font-mono text-muted-foreground">{usageText(run)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <Popconfirm
            description={t("agent:tasks_clear_runs_confirm")}
            onConfirm={onClear}
            destructive
            side="top"
            align="end"
          >
            <Button variant="outline" size="sm" data-testid="history-clear" disabled={runs.length === 0}>
              <Trash2 className="size-4" />
              {t("agent:tasks_clear_runs")}
            </Button>
          </Popconfirm>
        </div>
      </SheetContent>
    </Sheet>
  );
}
