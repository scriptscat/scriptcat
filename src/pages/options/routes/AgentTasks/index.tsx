import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@App/pages/components/ui/button";
import { AgentTaskRepo, AgentTaskRunRepo } from "@App/app/repo/agent_task";
import { agentClient } from "@App/pages/store/features/script";
import type { AgentTask, AgentModelConfig, AgentTaskRun } from "@App/app/service/agent/core/types";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { AgentPageHeader } from "../_agent/AgentPageHeader";
import { AgentEmptyState } from "../_agent/AgentEmptyState";
import { CountBar, type CountBarSegment } from "../_agent/CountBar";
import { TaskRow } from "./TaskRow";
import { TaskFormDialog, type TaskFormValue } from "./TaskFormDialog";
import { TaskHistorySheet } from "./TaskHistorySheet";
import { nextRunText } from "./cron";

const taskRepo = new AgentTaskRepo();
const taskRunRepo = new AgentTaskRunRepo();

export default function AgentTasks() {
  const { t } = useTranslation(["agent", "common"]);
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [models, setModels] = useState<AgentModelConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgentTask | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTask, setHistoryTask] = useState<AgentTask | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [runs, setRuns] = useState<AgentTaskRun[]>([]);

  const reload = useCallback(async () => {
    const [taskList, modelList] = await Promise.all([taskRepo.listTasks(), agentClient.listModels()]);
    setTasks(taskList);
    setModels(modelList);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (task: AgentTask) => {
    setEditing(task);
    setDialogOpen(true);
  };

  const handleSubmit = async (formValue: TaskFormValue) => {
    const now = Date.now();
    const task = (
      editing
        ? { ...formValue, id: editing.id, createtime: editing.createtime, updatetime: now }
        : { ...formValue, id: crypto.randomUUID(), createtime: now, updatetime: now }
    ) as AgentTask;
    await taskRepo.saveTask(task);
    setDialogOpen(false);
    toast.success(t("common:save_success"));
    await reload();
  };

  const handleToggle = async (task: AgentTask, enabled: boolean) => {
    await taskRepo.saveTask({ ...task, enabled, updatetime: Date.now() });
    await reload();
  };

  const handleDelete = async (task: AgentTask) => {
    await taskRepo.removeTask(task.id);
    toast.success(t("common:delete_success"));
    await reload();
  };

  const handleRunNow = async (task: AgentTask) => {
    try {
      await chrome.runtime.sendMessage({
        channel: "agent",
        action: "agentTask",
        data: { action: "runNow", id: task.id },
      });
      toast.success(t("agent:tasks_run_now"));
    } catch {
      // 调度器会在下次 tick 执行
      toast.info(t("agent:tasks_run_now"));
    }
  };

  const handleHistory = async (task: AgentTask) => {
    setHistoryTask(task);
    setHistoryOpen(true);
    setHistoryLoading(true);
    const list = await taskRunRepo.listRuns(task.id);
    setRuns(list);
    setHistoryLoading(false);
  };

  const handleClearRuns = async () => {
    if (!historyTask) return;
    await taskRunRepo.clearRuns(historyTask.id);
    setRuns([]);
  };

  const enabledCount = tasks.filter((task) => task.enabled).length;
  const soonest = tasks
    .filter((task) => task.enabled)
    .map((task) => nextRunText(task.crontab))
    .filter((r) => r.valid && r.at != null)
    .sort((a, b) => (a.at as number) - (b.at as number))[0];
  const countSegments: CountBarSegment[] = [
    { label: t("agent:tasks_count_total", { count: tasks.length, defaultValue: `${tasks.length} 个任务` }) },
    { label: t("agent:tasks_count_enabled", { count: enabledCount, defaultValue: `${enabledCount} 个已启用` }) },
  ];
  if (!isMobile && soonest) {
    countSegments.push({ label: `${t("agent:tasks_next_run")} ${soonest.text}` });
  }

  // 移动端:全局 MobileHeader(☰+抽屉+静态 ScriptCat) 已常驻,不再渲染 64px 页头;
  // 页名 + 新建动作改放页内顶部行,避免双层栏
  const mobileTopRow = (
    <div data-testid="tasks-mobile-top" className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-base font-semibold text-foreground">{t("agent:tasks_title")}</span>
      <Button data-testid="task-add" size="icon" onClick={handleAdd} aria-label={t("agent:tasks_create")}>
        <Plus className="size-4" />
      </Button>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {!isMobile && (
        <AgentPageHeader
          icon={CalendarClock}
          title={t("agent:tasks_title")}
          subtitle={t("agent:tasks_subtitle")}
          docHref="https://docs.scriptcat.org"
          docLabel={t("agent:tasks_docs", { defaultValue: "文档" })}
          actions={
            <Button data-testid="task-add" onClick={handleAdd}>
              <Plus className="size-4" />
              {t("agent:tasks_create")}
            </Button>
          }
        />
      )}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {isMobile && <div className="mb-4">{mobileTopRow}</div>}
        {!loading && tasks.length === 0 ? (
          <AgentEmptyState
            icon={CalendarClock}
            title={t("agent:tasks_no_tasks")}
            description={t("agent:tasks_no_tasks_desc")}
            action={
              <Button onClick={handleAdd}>
                <Plus className="size-4" />
                {t("agent:tasks_create")}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {tasks.length > 0 && <CountBar segments={countSegments} />}
            <div className="flex flex-col gap-2.5">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isMobile={isMobile}
                  onRun={() => handleRunNow(task)}
                  onEdit={() => handleEdit(task)}
                  onDelete={() => handleDelete(task)}
                  onToggle={(enabled) => handleToggle(task, enabled)}
                  onHistory={() => handleHistory(task)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <TaskFormDialog
        open={dialogOpen}
        value={editing}
        models={models}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
      />
      <TaskHistorySheet
        open={historyOpen}
        task={historyTask}
        runs={runs}
        loading={historyLoading}
        onClear={handleClearRuns}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
