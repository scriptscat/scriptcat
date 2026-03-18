import { describe, expect, it, beforeEach } from "vitest";
import { AgentTaskRepo, AgentTaskRunRepo } from "./agent_task";
import type { AgentTask, AgentTaskRun } from "@App/app/service/agent/types";

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-1",
    name: "测试任务",
    crontab: "0 9 * * *",
    mode: "internal",
    enabled: true,
    notify: false,
    createtime: Date.now(),
    updatetime: Date.now(),
    ...overrides,
  };
}

function makeRun(overrides: Partial<AgentTaskRun> = {}): AgentTaskRun {
  return {
    id: "run-1",
    taskId: "task-1",
    starttime: Date.now(),
    status: "running",
    ...overrides,
  };
}

describe.concurrent("AgentTaskRepo", () => {
  let repo: AgentTaskRepo;

  beforeEach(() => {
    repo = new AgentTaskRepo();
  });

  it.concurrent("saveTask / getTask CRUD", async () => {
    const task = makeTask();
    await repo.saveTask(task);
    const result = await repo.getTask("task-1");
    expect(result).toBeDefined();
    expect(result!.name).toBe("测试任务");
  });

  it.concurrent("listTasks 返回所有任务", async () => {
    await repo.saveTask(makeTask({ id: "t-a", name: "A" }));
    await repo.saveTask(makeTask({ id: "t-b", name: "B" }));
    const list = await repo.listTasks();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const names = list.map((t) => t.name);
    expect(names).toContain("A");
    expect(names).toContain("B");
  });

  it.concurrent("removeTask 删除任务", async () => {
    const task = makeTask({ id: "t-del" });
    await repo.saveTask(task);
    await repo.removeTask("t-del");
    const result = await repo.getTask("t-del");
    expect(result).toBeUndefined();
  });

  it.concurrent("removeTask 同时清理关联的 runs", async () => {
    const taskId = "t-clean";
    await repo.saveTask(makeTask({ id: taskId }));
    const runRepo = new AgentTaskRunRepo();
    await runRepo.appendRun(makeRun({ id: "r1", taskId }));
    await runRepo.appendRun(makeRun({ id: "r2", taskId }));

    await repo.removeTask(taskId);

    const runs = await runRepo.listRuns(taskId);
    expect(runs).toHaveLength(0);
  });
});

describe.concurrent("AgentTaskRunRepo", () => {
  let repo: AgentTaskRunRepo;

  beforeEach(() => {
    repo = new AgentTaskRunRepo();
  });

  it.concurrent("appendRun / listRuns", async () => {
    const taskId = "task-run-test";
    await repo.appendRun(makeRun({ id: "r-a", taskId, starttime: 1000 }));
    await repo.appendRun(makeRun({ id: "r-b", taskId, starttime: 2000 }));
    await repo.appendRun(makeRun({ id: "r-c", taskId, starttime: 3000 }));

    const runs = await repo.listRuns(taskId);
    expect(runs.length).toBe(3);
    // 按 starttime 降序
    expect(runs[0].id).toBe("r-c");
    expect(runs[1].id).toBe("r-b");
    expect(runs[2].id).toBe("r-a");
  });

  it.concurrent("listRuns 限制返回条数", async () => {
    const taskId = "task-limit";
    for (let i = 0; i < 5; i++) {
      await repo.appendRun(makeRun({ id: `rl-${i}`, taskId, starttime: i * 1000 }));
    }
    const runs = await repo.listRuns(taskId, 3);
    expect(runs.length).toBe(3);
  });

  it.concurrent("clearRuns 清理指定任务的运行历史", async () => {
    const taskId = "task-clear";
    await repo.appendRun(makeRun({ id: "rc-1", taskId }));
    await repo.appendRun(makeRun({ id: "rc-2", taskId }));
    // 其他任务的 run 不受影响
    await repo.appendRun(makeRun({ id: "rc-other", taskId: "other-task" }));

    await repo.clearRuns(taskId);

    const runs = await repo.listRuns(taskId);
    expect(runs).toHaveLength(0);

    const otherRuns = await repo.listRuns("other-task");
    expect(otherRuns).toHaveLength(1);
  });

  it.concurrent("updateRun 更新运行状态", async () => {
    await repo.appendRun(makeRun({ id: "r-upd", taskId: "t-upd" }));
    await repo.updateRun("r-upd", { status: "success", endtime: Date.now() });
    const runs = await repo.listRuns("t-upd");
    expect(runs[0].status).toBe("success");
    expect(runs[0].endtime).toBeDefined();
  });
});
