import type { AgentTask, AgentTaskRun, EventAgentTask, InternalAgentTask } from "@App/app/service/agent/core/types";
import type { AgentTaskRepo, AgentTaskRunRepo } from "@App/app/repo/agent_task";
import { nextTimeInfo } from "@App/pkg/utils/cron";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { isRevisionConflict } from "@App/app/repo/revision";

export type InternalExecutor = (task: InternalAgentTask) => Promise<{
  conversationId: string;
  usage?: { inputTokens: number; outputTokens: number };
}>;

export type EventEmitter = (task: EventAgentTask) => Promise<void>;

export class AgentTaskScheduler {
  private runningTasks = new Set<string>();

  constructor(
    private repo: AgentTaskRepo,
    private runRepo: AgentTaskRunRepo,
    private internalExecutor: InternalExecutor,
    private eventEmitter: EventEmitter
  ) {}

  async init(): Promise<void> {
    // 加载所有 enabled 任务，计算 nextruntime
    const tasks = await this.repo.listTasks();
    for (const task of tasks) {
      if (task.enabled && !task.nextruntime) {
        try {
          const info = nextTimeInfo(task.crontab);
          task.nextruntime = info.next.toMillis();
          task.updatetime = Date.now();
          await this.repo.saveTask(task);
        } catch {
          // cron 表达式无效，跳过
        }
      }
    }
  }

  async tick(now?: number): Promise<void> {
    const currentTime = now ?? Date.now();
    const tasks = await this.repo.listTasks();

    for (const task of tasks) {
      if (!task.enabled) continue;
      if (this.runningTasks.has(task.id)) continue;
      if (!task.nextruntime || task.nextruntime > currentTime) continue;

      // 不 await，并行执行多个任务
      this.executeTask(task, true, currentTime).catch(() => {
        // 错误已在 executeTask 内部处理
      });
    }
  }

  async executeTask(task: AgentTask, claimScheduled = false, now = Date.now()): Promise<void> {
    if (this.runningTasks.has(task.id)) return;
    this.runningTasks.add(task.id);

    try {
      let executionTask = task;
      if (claimScheduled) {
        const claimed = await this.repo.claimDueTask(task.id, task.generation!, now);
        if (!claimed) return;
        executionTask = claimed;
      }
      const run: AgentTaskRun = {
        id: uuidv4(),
        taskId: executionTask.id,
        starttime: Date.now(),
        status: "running",
      };
      await this.runRepo.appendRun(run);

      try {
        if (executionTask.mode === "internal") {
          const result = await this.internalExecutor(executionTask);
          run.conversationId = result.conversationId;
          run.usage = result.usage;
        } else {
          await this.eventEmitter(executionTask);
        }

        run.status = "success";
        run.endtime = Date.now();
      } catch (e: any) {
        run.status = "error";
        run.error = e.message || "Unknown error";
        if (e.usage) run.usage = e.usage;
        if (e.conversationId) run.conversationId = e.conversationId;
        run.endtime = Date.now();
      }

      await this.runRepo.updateRun(executionTask.id, run.id, {
        status: run.status,
        endtime: run.endtime,
        error: run.error,
        conversationId: run.conversationId,
        usage: run.usage,
      });

      // 只合并运行遥测，不保存启动时的旧配置快照；运行期间的编辑/禁用必须保留。
      try {
        await this.repo.updateRunState(
          executionTask.id,
          executionTask.generation!,
          {
            lastruntime: run.starttime,
            lastRunStatus: run.status === "success" ? "success" : "error",
            lastRunError: run.error,
          },
          !claimScheduled
        );
      } catch (error) {
        // 删除或重建发生在运行期间时，旧 generation 的完成回写应被丢弃，而不是复活任务。
        if (!isRevisionConflict(error)) throw error;
      }
    } finally {
      // 必须在最外层 finally 确保任何异常都能清理 runningTasks
      this.runningTasks.delete(task.id);
    }
  }

  isRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }
}
