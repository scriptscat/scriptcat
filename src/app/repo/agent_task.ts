import type { AgentTask, AgentTaskRun } from "@App/app/service/agent/core/types";
import { Repo } from "./repo";
import { OPFSRepo } from "./opfs_repo";

export class AgentTaskRepo extends Repo<AgentTask> {
  constructor() {
    super("agent_task:");
    this.enableCache();
  }

  async listTasks(): Promise<AgentTask[]> {
    return this.find();
  }

  async getTask(id: string): Promise<AgentTask | undefined> {
    return this.get(id);
  }

  async saveTask(task: AgentTask): Promise<void> {
    await this._save(task.id, task);
  }

  async removeTask(id: string): Promise<void> {
    await this.delete(id);
    // 同时清理关联的 runs
    const runRepo = new AgentTaskRunRepo();
    await runRepo.clearRuns(id);
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

  async appendRun(run: AgentTaskRun): Promise<void> {
    const runs = await this.readJsonFile<AgentTaskRun[]>(this.filename(run.taskId), []);
    runs.unshift(run);
    // 环形缓冲：超过上限时裁剪最老的记录
    if (runs.length > MAX_RUNS_PER_TASK) {
      runs.length = MAX_RUNS_PER_TASK;
    }
    await this.writeJsonFile(this.filename(run.taskId), runs);
  }

  async updateRun(taskId: string, id: string, data: Partial<AgentTaskRun>): Promise<void> {
    const runs = await this.readJsonFile<AgentTaskRun[]>(this.filename(taskId), []);
    const idx = runs.findIndex((r) => r.id === id);
    if (idx < 0) return;
    Object.assign(runs[idx], data);
    await this.writeJsonFile(this.filename(taskId), runs);
  }

  async listRuns(taskId: string, limit = 50): Promise<AgentTaskRun[]> {
    const runs = await this.readJsonFile<AgentTaskRun[]>(this.filename(taskId), []);
    return runs.slice(0, limit);
  }

  async clearRuns(taskId: string): Promise<void> {
    await this.deleteFile(this.filename(taskId));
  }
}
