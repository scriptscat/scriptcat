import type { AgentTask, AgentTaskRun } from "@App/app/service/agent/core/types";
import { Repo } from "./repo";
import { OPFSRepo } from "./opfs_repo";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { RevisionConflictError } from "./revision";
import { nextTimeInfo } from "@App/pkg/utils/cron";

function normalizeTask(task: AgentTask): AgentTask {
  return {
    ...task,
    generation: task.generation || `legacy:${task.id}`,
    revision: task.revision ?? 0,
  };
}

function withTaskLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const key = `agent-task:${id}`;
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (locks?.request) return locks.request(key, { mode: "exclusive" }, fn) as Promise<T>;
  return stackAsyncTask(key, fn);
}

export class AgentTaskRepo extends Repo<AgentTask> {
  constructor() {
    super("agent_task:");
  }

  async listTasks(): Promise<AgentTask[]> {
    return (await this.find()).map(normalizeTask);
  }

  async getTask(id: string): Promise<AgentTask | undefined> {
    const task = await this.get(id);
    return task ? normalizeTask(task) : undefined;
  }

  async createTask(task: AgentTask): Promise<AgentTask> {
    return withTaskLock(task.id, async () => {
      if (await this.getTask(task.id)) throw new RevisionConflictError(`Task "${task.id}" already exists`);
      const created = normalizeTask({ ...task, generation: uuidv4(), revision: 1 });
      await this._save(created.id, created);
      Object.assign(task, created);
      return created;
    });
  }

  async saveTask(task: AgentTask): Promise<AgentTask> {
    return withTaskLock(task.id, async () => {
      const current = await this.getTask(task.id);
      if (!current) {
        // Backward-compatible import path for legacy unversioned records. Versioned stale writes never create.
        if (task.generation !== undefined || task.revision !== undefined) {
          throw new RevisionConflictError(`Task "${task.id}" was deleted`);
        }
        const created = normalizeTask({ ...task, generation: uuidv4(), revision: 1 });
        await this._save(created.id, created);
        Object.assign(task, created);
        return created;
      }
      if (task.generation !== current.generation || task.revision !== current.revision) {
        throw new RevisionConflictError(`Task "${task.id}" changed or was deleted`);
      }
      const saved = normalizeTask({ ...task, revision: current.revision! + 1 });
      await this._save(saved.id, saved);
      Object.assign(task, saved);
      return saved;
    });
  }

  /** Restore a task from backup while keeping generations local to this installation. */
  async importTask(task: AgentTask): Promise<AgentTask> {
    return withTaskLock(task.id, async () => {
      const current = await this.getTask(task.id);
      const imported = normalizeTask({
        ...task,
        generation: current?.generation || uuidv4(),
        revision: current ? current.revision! + 1 : 1,
      });
      await this._save(imported.id, imported);
      return imported;
    });
  }

  async updateRunState(
    id: string,
    generation: string,
    state: Pick<AgentTask, "lastruntime" | "lastRunStatus" | "lastRunError">,
    advanceSchedule = false
  ): Promise<AgentTask> {
    return withTaskLock(id, async () => {
      const current = await this.getTask(id);
      if (!current || current.generation !== generation) {
        throw new RevisionConflictError(`Task "${id}" changed or was deleted`);
      }
      const saved = normalizeTask({
        ...current,
        ...state,
        nextruntime: advanceSchedule ? nextTimeInfo(current.crontab).next.toMillis() : current.nextruntime,
        revision: current.revision! + 1,
        updatetime: Date.now(),
      });
      await this._save(id, saved);
      return saved;
    });
  }

  async claimDueTask(id: string, generation: string, now: number): Promise<AgentTask | null> {
    return withTaskLock(id, async () => {
      const current = await this.getTask(id);
      if (
        !current ||
        current.generation !== generation ||
        !current.enabled ||
        !current.nextruntime ||
        current.nextruntime > now
      ) {
        return null;
      }
      const saved = normalizeTask({
        ...current,
        nextruntime: nextTimeInfo(current.crontab).next.toMillis(),
        revision: current.revision! + 1,
        updatetime: Date.now(),
      });
      await this._save(id, saved);
      return saved;
    });
  }

  async removeTask(id: string, generation?: string, expectedRevision?: number): Promise<void> {
    await withTaskLock(id, async () => {
      const current = await this.getTask(id);
      const runRepo = new AgentTaskRunRepo();
      if (!current) {
        // A previous attempt may have removed chrome.storage state before OPFS run cleanup failed.
        await runRepo.clearRuns(id);
        return;
      }
      if (
        (generation !== undefined && current.generation !== generation) ||
        (expectedRevision !== undefined && current.revision !== expectedRevision)
      ) {
        throw new RevisionConflictError(`Task "${id}" changed before deletion`);
      }
      await this.delete(id);
      // 同时清理关联的 runs
      await runRepo.clearRuns(id);
    });
  }
}

const MAX_RUNS_PER_TASK = 500;

export class AgentTaskRunRepo extends OPFSRepo {
  constructor() {
    super("task_runs");
  }

  private filename(taskId: string): string {
    return `${taskId}.json`;
  }

  private async writeRunsConfirmed(taskId: string, runs: AgentTaskRun[]): Promise<void> {
    const filename = this.filename(taskId);
    try {
      await this.writeJsonFile(filename, runs);
    } catch (error) {
      try {
        const durable = await this.readJsonFile<AgentTaskRun[]>(filename, []);
        if (JSON.stringify(durable) === JSON.stringify(runs)) return;
      } catch {
        // Preserve the original write error when read-back confirmation itself fails.
      }
      throw error;
    }
  }

  async appendRun(run: AgentTaskRun): Promise<boolean> {
    return this.withFileLock(`runs:${run.taskId}`, async () => {
      const runs = await this.readJsonFile<AgentTaskRun[]>(this.filename(run.taskId), []);
      if (runs.some((existing) => existing.id === run.id)) return false;
      runs.unshift(run);
      // 环形缓冲：超过上限时裁剪最老的记录
      if (runs.length > MAX_RUNS_PER_TASK) runs.length = MAX_RUNS_PER_TASK;
      await this.writeRunsConfirmed(run.taskId, runs);
      return true;
    });
  }

  async updateRun(taskId: string, id: string, data: Partial<AgentTaskRun>): Promise<void> {
    await this.withFileLock(`runs:${taskId}`, async () => {
      const runs = await this.readJsonFile<AgentTaskRun[]>(this.filename(taskId), []);
      const idx = runs.findIndex((run) => run.id === id);
      if (idx < 0) return;
      Object.assign(runs[idx], data);
      await this.writeRunsConfirmed(taskId, runs);
    });
  }

  async removeRun(taskId: string, id: string): Promise<void> {
    await this.withFileLock(`runs:${taskId}`, async () => {
      const runs = await this.readJsonFile<AgentTaskRun[]>(this.filename(taskId), []);
      const retained = runs.filter((run) => run.id !== id);
      if (retained.length === runs.length) return;
      await this.writeRunsConfirmed(taskId, retained);
    });
  }

  async listRuns(taskId: string, limit = 50): Promise<AgentTaskRun[]> {
    const runs = await this.readJsonFile<AgentTaskRun[]>(this.filename(taskId), []);
    return runs.slice(0, limit);
  }

  async clearRuns(taskId: string): Promise<void> {
    await this.withFileLock(`runs:${taskId}`, () => this.deleteFile(this.filename(taskId)));
  }
}
