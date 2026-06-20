import { useTranslation } from "react-i18next";
import { Workflow, Zap, Bell, Play, Pencil, Trash2, History, Timer, ArrowRight } from "lucide-react";
import type { AgentTask } from "@App/app/service/agent/core/types";
import { Switch } from "@App/pages/components/ui/switch";
import { cn } from "@App/pkg/utils/cn";
import { AgentCardMenu, type AgentCardMenuItem } from "../_agent/AgentCardMenu";
import { StatusDot, CapabilityTag } from "../_agent/tags";
import { nextRunText } from "./cron";

export function TaskRow({
  task,
  isMobile = false,
  onRun,
  onEdit,
  onDelete,
  onToggle,
  onHistory,
}: {
  task: AgentTask;
  isMobile?: boolean;
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

  const avatar = (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
        isInternal ? "bg-primary/10" : "bg-success-bg"
      )}
    >
      <ModeIcon className={cn("size-[18px]", isInternal ? "text-primary" : "text-success-fg")} />
    </div>
  );

  const nameRow = (showBell: boolean) => (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate text-sm font-semibold text-foreground">{task.name}</span>
      <CapabilityTag tone={isInternal ? "blue" : "green"}>
        {isInternal ? t("agent:tasks_mode_internal_short") : t("agent:tasks_mode_event_short")}
      </CapabilityTag>
      {showBell && task.notify && <Bell className="size-3.5 shrink-0 text-muted-foreground" />}
    </div>
  );

  const metaRow = (
    <div className="flex min-w-0 flex-wrap items-center gap-2.5 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
        {isInternal ? <Timer className="size-3" /> : <Zap className="size-3" />}
        {isInternal ? task.crontab : t("agent:tasks_event_trigger")}
      </span>
      {isInternal && next.valid && (
        <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
          <ArrowRight className="size-3 shrink-0" />
          <span className="truncate">{next.text}</span>
        </span>
      )}
    </div>
  );

  const statusTag = <StatusDot tone={statusTone}>{statusLabel}</StatusDot>;
  const enableSwitch = <Switch data-testid="task-toggle" checked={task.enabled} onCheckedChange={(v) => onToggle(v)} />;
  const runBtn = (
    <button
      type="button"
      data-testid="task-run"
      onClick={onRun}
      title={t("agent:tasks_run_now")}
      aria-label={t("agent:tasks_run_now")}
      className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Play className="size-4" />
    </button>
  );
  const kebab = <AgentCardMenu items={menuItems} />;

  if (isMobile) {
    return (
      <div
        className={cn(
          "flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5",
          !task.enabled && "opacity-60"
        )}
      >
        <div className="flex items-center gap-3">
          {avatar}
          <div className="min-w-0 flex-1">{nameRow(false)}</div>
          {enableSwitch}
        </div>
        {metaRow}
        <div className="flex items-center gap-2">
          {statusTag}
          <div className="flex-1" />
          {runBtn}
          {kebab}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3.5 rounded-[10px] border border-border bg-card px-[18px] py-3.5",
        !task.enabled && "opacity-60"
      )}
    >
      {avatar}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {nameRow(true)}
        {metaRow}
      </div>
      {statusTag}
      {enableSwitch}
      {runBtn}
      {kebab}
    </div>
  );
}
