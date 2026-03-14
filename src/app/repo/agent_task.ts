import type { AgentTask, AgentTaskRun } from "@App/app/service/agent/types";
import { Repo } from "./repo";

export class AgentTaskRepo extends Repo<AgentTask> {
  constructor() {
    super("agent_task:");
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

export class AgentTaskRunRepo extends Repo<AgentTaskRun> {
  constructor() {
    super("agent_task_run:");
  }

  async appendRun(run: AgentTaskRun): Promise<void> {
    await this._save(run.id, run);
  }

  async updateRun(id: string, data: Partial<AgentTaskRun>): Promise<void> {
    await this.update(id, data);
  }

  async listRuns(taskId: string, limit = 50): Promise<AgentTaskRun[]> {
    const all = await this.find((_key, value) => value.taskId === taskId);
    // 按 starttime 降序排列
    all.sort((a, b) => b.starttime - a.starttime);
    return all.slice(0, limit);
  }

  async clearRuns(taskId: string): Promise<void> {
    const all = await this.find((_key, value) => value.taskId === taskId);
    if (all.length > 0) {
      const keys = all.map((r) => r.id);
      await this.deletes(keys);
    }
  }
}
