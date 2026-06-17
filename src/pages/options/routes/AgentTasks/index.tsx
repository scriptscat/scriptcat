import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@App/pages/components/ui/button";
import { AgentTaskRepo, AgentTaskRunRepo } from "@App/app/repo/agent_task";
import { agentClient } from "@App/pages/store/features/script";
import type { AgentTask, AgentModelConfig, AgentTaskRun } from "@App/app/service/agent/core/types";
import { AgentPageHeader } from "../_agent/AgentPageHeader";
import { AgentEmptyState } from "../_agent/AgentEmptyState";
import { TaskRow } from "./TaskRow";
import { TaskFormDialog, type TaskFormValue } from "./TaskFormDialog";
import { TaskHistorySheet } from "./TaskHistorySheet";

const taskRepo = new AgentTaskRepo();
const taskRunRepo = new AgentTaskRunRepo();

export default function AgentTasks() {
  const { t } = useTranslation(["agent", "common"]);
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
      await chrome.runtime.sendMessage({ channel: "agent", action: "agentTask", data: { action: "runNow", id: task.id } });
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

  return (
    <div className="flex h-full flex-col">
      <AgentPageHeader
        icon={CalendarClock}
        title={t("agent:tasks_title")}
        subtitle={t("agent:tasks_subtitle")}
        actions={
          <Button data-testid="task-add" onClick={handleAdd}>
            <Plus className="size-4" />
            {t("agent:tasks_create")}
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
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
          <div className="flex flex-col gap-3">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onRun={() => handleRunNow(task)}
                onEdit={() => handleEdit(task)}
                onDelete={() => handleDelete(task)}
                onToggle={(enabled) => handleToggle(task, enabled)}
                onHistory={() => handleHistory(task)}
              />
            ))}
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
