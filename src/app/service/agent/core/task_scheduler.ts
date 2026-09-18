import type { AgentTask, AgentTaskRun, EventAgentTask, InternalAgentTask } from "@App/app/service/agent/core/types";
import type { AgentTaskRepo, AgentTaskRunRepo } from "@App/app/repo/agent_task";
import { nextTimeInfo } from "@App/pkg/utils/cron";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { isRevisionConflict } from "@App/app/repo/revision";

export type InternalExecutor = (
  task: InternalAgentTask,
  signal: AbortSignal
) => Promise<{
  conversationId: string;
  usage?: { inputTokens: number; outputTokens: number };
}>;

export type EventEmitter = (task: EventAgentTask, signal: AbortSignal) => Promise<void>;

export class AgentTaskScheduler {
  private runningTasks = new Map<string, AbortController>();
  private initialization?: Promise<void>;

  constructor(
    private repo: AgentTaskRepo,
    private runRepo: AgentTaskRunRepo,
    private internalExecutor: InternalExecutor,
    private eventEmitter: EventEmitter
  ) {}

  async init(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.initialize().catch((error) => {
        this.initialization = undefined;
        throw error;
      });
    }
    return this.initialization;
  }

  private async initialize(): Promise<void> {
    // 加载所有 enabled 任务，计算 nextruntime
    const tasks = await this.repo.listTasks();
    for (const task of tasks) {
      let currentTask = task;
      if (task.enabled && !task.nextruntime) {
        let nextRuntime: number | undefined;
        try {
          nextRuntime = nextTimeInfo(task.crontab).next.toMillis();
        } catch {
          // cron 表达式无效，保留未调度状态
        }
        if (nextRuntime !== undefined) {
          task.nextruntime = nextRuntime;
          task.updatetime = Date.now();
          currentTask = await this.repo.saveTask(task);
        }
      }

      // A Service Worker restart can terminate JavaScript after the durable claim advanced nextruntime but
      // before the executor outcome was recorded. Replaying may duplicate irreversible side effects, so use an
      // explicit at-most-once recovery policy: close stale running telemetry as outcome-unknown and keep the
      // already advanced schedule.
      const interruptedRuns = (await this.runRepo.listRuns(currentTask.id, 500)).filter(
        (run) => run.status === "running"
      );
      if (interruptedRuns.length > 0) {
        const endtime = Date.now();
        const error = "Task execution interrupted by service restart; outcome unknown";
        await Promise.all(
          interruptedRuns.map((run) =>
            this.runRepo.updateRun(currentTask.id, run.id, { status: "error", error, endtime })
          )
        );
        await this.repo.updateRunState(currentTask.id, currentTask.generation!, {
          lastruntime: Math.max(...interruptedRuns.map((run) => run.starttime)),
          lastRunStatus: "error",
          lastRunError: error,
        });
      }
    }
  }

  async tick(now?: number): Promise<void> {
    await this.init();
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
    const abortController = new AbortController();
    this.runningTasks.set(task.id, abortController);

    try {
      await this.init();
      const run: AgentTaskRun = {
        id:
          claimScheduled && task.nextruntime ? `scheduled:${task.id}:${task.generation}:${task.nextruntime}` : uuidv4(),
        taskId: task.id,
        starttime: Date.now(),
        status: "running",
      };
      // Record the slot before advancing nextruntime. A deterministic scheduled-run ID makes a restart between
      // these two durable writes idempotent instead of either losing the slot or creating duplicate run records.
      const createdRun = (await this.runRepo.appendRun(run)) !== false;
      let executionTask = task;
      if (claimScheduled) {
        const claimed = await this.repo.claimDueTask(task.id, task.generation!, now);
        if (!claimed) {
          if (createdRun) await this.runRepo.removeRun(task.id, run.id);
          return;
        }
        executionTask = claimed;
      }

      try {
        if (abortController.signal.aborted) throw new Error("Task cancelled");
        if (executionTask.mode === "internal") {
          const result = await this.internalExecutor(executionTask, abortController.signal);
          run.conversationId = result.conversationId;
          run.usage = result.usage;
        } else {
          await this.eventEmitter(executionTask, abortController.signal);
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
      if (this.runningTasks.get(task.id) === abortController) this.runningTasks.delete(task.id);
    }
  }

  isRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }

  cancelTask(taskId: string): boolean {
    const abortController = this.runningTasks.get(taskId);
    if (!abortController) return false;
    abortController.abort();
    return true;
  }
}
