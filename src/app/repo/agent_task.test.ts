import { describe, expect, it, beforeEach, vi } from "vitest";
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

  it("任务已删除但 runs 清理失败时重试仍应完成孤儿历史清理", async () => {
    const taskId = "t-clean-retry";
    await repo.saveTask(makeTask({ id: taskId }));
    const runRepo = new AgentTaskRunRepo();
    await runRepo.appendRun(makeRun({ id: "retry-run", taskId }));
    const originalClearRuns = AgentTaskRunRepo.prototype.clearRuns;
    const clearRuns = vi
      .spyOn(AgentTaskRunRepo.prototype, "clearRuns")
      .mockRejectedValueOnce(new Error("temporary OPFS failure"))
      .mockImplementation(function (this: AgentTaskRunRepo, id: string) {
        return originalClearRuns.call(this, id);
      });

    await expect(repo.removeTask(taskId)).rejects.toThrow("temporary OPFS failure");
    expect(await repo.getTask(taskId)).toBeUndefined();
    await repo.removeTask(taskId);

    expect(await runRepo.listRuns(taskId)).toHaveLength(0);
    expect(clearRuns).toHaveBeenCalledTimes(2);
  });

  it("删除后旧 generation 的完成写入不应复活任务", async () => {
    const task = await repo.saveTask(makeTask({ id: "stale-task" }));
    await repo.removeTask(task.id, task.generation, task.revision);

    task.lastRunStatus = "success";
    await expect(repo.saveTask(task)).rejects.toThrow("deleted");
    await expect(
      repo.updateRunState(task.id, task.generation!, {
        lastruntime: Date.now(),
        lastRunStatus: "success",
        lastRunError: undefined,
      })
    ).rejects.toThrow("deleted");
    expect(await repo.getTask(task.id)).toBeUndefined();
  });

  it("旧 revision 不应覆盖用户刚保存的新配置", async () => {
    const task = await repo.saveTask(makeTask({ id: "cas-task" }));
    const stale = { ...task } as AgentTask;
    task.name = "新配置";
    await repo.saveTask(task);

    stale.name = "旧配置";
    await expect(repo.saveTask(stale)).rejects.toThrow("changed");
    expect((await repo.getTask(task.id))?.name).toBe("新配置");
  });

  it("从备份导入时应忽略外部 generation 并以本机版本覆盖同 ID 任务", async () => {
    const local = await repo.saveTask(makeTask({ id: "import-task", name: "本机" }));

    const imported = await repo.importTask(
      makeTask({ id: "import-task", name: "备份", generation: "foreign-generation", revision: 99 })
    );

    expect(imported).toMatchObject({
      name: "备份",
      generation: local.generation,
      revision: local.revision! + 1,
    });
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

  it("写入已提交但 close 报错时应以 durable read-back 确认 append/update/remove", async () => {
    const taskId = "ambiguous-run-write";
    const originalWrite = (repo as any).writeJsonFile.bind(repo);
    const failAfterCommit = () =>
      vi.spyOn(repo as any, "writeJsonFile").mockImplementationOnce(async (...args: unknown[]) => {
        await originalWrite(...args);
        throw new Error("close failed after commit");
      });

    failAfterCommit();
    await expect(repo.appendRun(makeRun({ id: "ambiguous-run", taskId }))).resolves.toBe(true);

    failAfterCommit();
    await expect(repo.updateRun(taskId, "ambiguous-run", { status: "success" })).resolves.toBeUndefined();
    expect((await repo.listRuns(taskId))[0].status).toBe("success");

    failAfterCommit();
    await expect(repo.removeRun(taskId, "ambiguous-run")).resolves.toBeUndefined();
    expect(await repo.listRuns(taskId)).toHaveLength(0);
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
