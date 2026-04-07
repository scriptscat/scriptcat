import type { AgentTask, AgentTaskRun, EventAgentTask, InternalAgentTask } from "@App/app/service/agent/core/types";
import type { AgentTaskRepo, AgentTaskRunRepo } from "@App/app/repo/agent_task";
import { nextTimeInfo } from "@App/pkg/utils/cron";
import { uuidv4 } from "@App/pkg/utils/uuid";

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
      this.executeTask(task).catch(() => {
        // 错误已在 executeTask 内部处理
      });
    }
  }

  async executeTask(task: AgentTask): Promise<void> {
    if (this.runningTasks.has(task.id)) return;
    this.runningTasks.add(task.id);

    try {
      const run: AgentTaskRun = {
        id: uuidv4(),
        taskId: task.id,
        starttime: Date.now(),
        status: "running",
      };
      await this.runRepo.appendRun(run);

      try {
        if (task.mode === "internal") {
          const result = await this.internalExecutor(task);
          run.conversationId = result.conversationId;
          run.usage = result.usage;
        } else {
          await this.eventEmitter(task);
        }

        run.status = "success";
        run.endtime = Date.now();

        task.lastRunStatus = "success";
        task.lastRunError = undefined;
      } catch (e: any) {
        run.status = "error";
        run.error = e.message || "Unknown error";
        run.endtime = Date.now();

        task.lastRunStatus = "error";
        task.lastRunError = run.error;
      } finally {
        // 更新 run 记录
        await this.runRepo.updateRun(task.id, run.id, {
          status: run.status,
          endtime: run.endtime,
          error: run.error,
          conversationId: run.conversationId,
          usage: run.usage,
        });

        // 更新 task 状态
        task.lastruntime = run.starttime;
        try {
          const info = nextTimeInfo(task.crontab);
          task.nextruntime = info.next.toMillis();
        } catch {
          task.nextruntime = undefined;
        }
        task.updatetime = Date.now();
        await this.repo.saveTask(task);
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
