import { describe, expect, it, beforeEach } from "vitest";
import { AgentTaskRepo, AgentTaskRunRepo } from "./agent_task";
import type { AgentTask, AgentTaskRun } from "@App/app/service/agent/core/types";
import { createMockOPFS } from "./test-helpers";

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-1",
    name: "测试任务",
    crontab: "0 9 * * *",
    mode: "internal",
    prompt: "",
    enabled: true,
    notify: false,
    createtime: Date.now(),
    updatetime: Date.now(),
    ...overrides,
  } as AgentTask;
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

describe("AgentTaskRepo", () => {
  let repo: AgentTaskRepo;

  beforeEach(() => {
    createMockOPFS();
    repo = new AgentTaskRepo();
  });

  it("saveTask / getTask CRUD", async () => {
    const task = makeTask({ id: "crud-task" });
    await repo.saveTask(task);
    const result = await repo.getTask("crud-task");
    expect(result).toBeDefined();
    expect(result!.name).toBe("测试任务");
  });

  it("listTasks 返回所有任务", async () => {
    await repo.saveTask(makeTask({ id: "list-a", name: "A" }));
    await repo.saveTask(makeTask({ id: "list-b", name: "B" }));
    const list = await repo.listTasks();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const names = list.map((t) => t.name);
    expect(names).toContain("A");
    expect(names).toContain("B");
  });

  it("removeTask 删除任务", async () => {
    const task = makeTask({ id: "t-del" });
    await repo.saveTask(task);
    await repo.removeTask("t-del");
    const result = await repo.getTask("t-del");
    expect(result).toBeUndefined();
  });

  it("removeTask 同时清理关联的 runs", async () => {
    const taskId = "t-clean";
    await repo.saveTask(makeTask({ id: taskId }));
    const runRepo = new AgentTaskRunRepo();
    await runRepo.appendRun(makeRun({ id: "r1", taskId, starttime: 1000 }));
    await runRepo.appendRun(makeRun({ id: "r2", taskId, starttime: 2000 }));

    await repo.removeTask(taskId);

    const runs = await runRepo.listRuns(taskId);
    expect(runs).toHaveLength(0);
  });
});

describe("AgentTaskRunRepo", () => {
  let repo: AgentTaskRunRepo;

  beforeEach(() => {
    createMockOPFS();
    repo = new AgentTaskRunRepo();
  });

  it("appendRun / listRuns 按 starttime 降序", async () => {
    const taskId = "task-run-test";
    await repo.appendRun(makeRun({ id: "r-a", taskId, starttime: 1000 }));
    await repo.appendRun(makeRun({ id: "r-b", taskId, starttime: 2000 }));
    await repo.appendRun(makeRun({ id: "r-c", taskId, starttime: 3000 }));

    const runs = await repo.listRuns(taskId);
    expect(runs.length).toBe(3);
    // 按 starttime 降序（最新在前）
    expect(runs[0].id).toBe("r-c");
    expect(runs[1].id).toBe("r-b");
    expect(runs[2].id).toBe("r-a");
  });

  it("listRuns 限制返回条数", async () => {
    const taskId = "task-limit";
    for (let i = 0; i < 5; i++) {
      await repo.appendRun(makeRun({ id: `rl-${i}`, taskId, starttime: i * 1000 }));
    }
    const runs = await repo.listRuns(taskId, 3);
    expect(runs.length).toBe(3);
  });

  it("clearRuns 清理指定任务的运行历史", async () => {
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

  it("updateRun 更新运行状态", async () => {
    await repo.appendRun(makeRun({ id: "r-upd", taskId: "t-upd" }));
    await repo.updateRun("t-upd", "r-upd", { status: "success", endtime: 99999 });
    const runs = await repo.listRuns("t-upd");
    expect(runs[0].status).toBe("success");
    expect(runs[0].endtime).toBe(99999);
  });

  it("updateRun 找不到 id 时静默忽略", async () => {
    await repo.appendRun(makeRun({ id: "r-exists", taskId: "t-miss" }));
    await repo.updateRun("t-miss", "r-nonexistent", { status: "error" });
    const runs = await repo.listRuns("t-miss");
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("running");
  });

  it("appendRun 超过 MAX_RUNS_PER_TASK 时裁剪最老记录", async () => {
    const taskId = "task-ring";
    // 预填 500 条数据（最新在前），避免逐条 append 超时
    const prefilled: AgentTaskRun[] = [];
    for (let i = 499; i >= 0; i--) {
      prefilled.push(makeRun({ id: `rr-${i}`, taskId, starttime: i }));
    }
    await (repo as any).writeJsonFile(`${taskId}.json`, prefilled);

    // 再 append 5 条（id rr-500 ~ rr-504），触发裁剪
    for (let i = 500; i < 505; i++) {
      await repo.appendRun(makeRun({ id: `rr-${i}`, taskId, starttime: i }));
    }
    const runs = await repo.listRuns(taskId, 600);
    expect(runs.length).toBe(500);
    // 最新的在前，最老 5 条被裁剪掉（rr-0 ~ rr-4）
    expect(runs[0].id).toBe("rr-504");
    expect(runs[499].id).toBe("rr-5");
  });
});
