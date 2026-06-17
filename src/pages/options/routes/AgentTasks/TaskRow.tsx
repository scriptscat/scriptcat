import { useTranslation } from "react-i18next";
import { Workflow, Zap, Bell, Play, Pencil, Trash2, History } from "lucide-react";
import type { AgentTask } from "@App/app/service/agent/core/types";
import { Switch } from "@App/pages/components/ui/switch";
import { cn } from "@App/pkg/utils/cn";
import { AgentCardMenu, type AgentCardMenuItem } from "../_agent/AgentCardMenu";
import { StatusDot, CapabilityTag } from "../_agent/tags";
import { nextRunText } from "./cron";

export function TaskRow({
  task,
  onRun,
  onEdit,
  onDelete,
  onToggle,
  onHistory,
}: {
  task: AgentTask;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  onHistory: () => void;
}) {
  const { t } = useTranslation(["agent", "common"]);
  const menuItems: AgentCardMenuItem[] = [
    { key: "history", label: t("agent:tasks_history"), icon: History, onSelect: onHistory },
    { key: "edit", label: t("common:edit"), icon: Pencil, onSelect: onEdit },
    { key: "delete", label: t("common:delete"), icon: Trash2, danger: true, onSelect: onDelete },
  ];

  const isInternal = task.mode === "internal";
  const ModeIcon = isInternal ? Workflow : Zap;

  const status = task.lastRunStatus;
  const statusTone = status === "success" ? "success" : status === "error" ? "error" : "muted";
  const statusLabel =
    status === "success"
      ? t("agent:tasks_run_status_success")
      : status === "error"
        ? t("agent:tasks_run_status_error")
        : t("agent:tasks_never_run");

  const next = nextRunText(task.crontab);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-4",
        !task.enabled && "opacity-60"
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
        <ModeIcon className="size-[18px] text-primary" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{task.name}</span>
          <CapabilityTag tone="muted">
            {isInternal ? t("agent:tasks_mode_internal") : t("agent:tasks_mode_event")}
          </CapabilityTag>
          {task.notify && <Bell className="size-3.5 text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{task.crontab}</code>
          {next.valid && (
            <span className="truncate">
              {t("agent:tasks_next_run")}: {next.text}
            </span>
          )}
          <StatusDot tone={statusTone}>{statusLabel}</StatusDot>
        </div>
      </div>

      <button
        type="button"
        data-testid="task-run"
        onClick={onRun}
        title={t("agent:tasks_run_now")}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Play className="size-4" />
      </button>
      <Switch data-testid="task-toggle" checked={task.enabled} onCheckedChange={(v) => onToggle(v)} />
      <AgentCardMenu items={menuItems} />
    </div>
  );
}
