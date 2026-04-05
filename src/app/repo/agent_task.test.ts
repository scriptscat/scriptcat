import { describe, expect, it, vi, beforeEach } from "vitest";
import { AgentTaskRepo, AgentTaskRunRepo } from "./agent_task";
import type { AgentTask, AgentTaskRun } from "@App/app/service/agent/core/types";

// Mock OPFS 文件系统
function createMockOPFS() {
  function createMockWritable() {
    let data: any = null;
    return {
      write: vi.fn(async (content: any) => {
        data = content;
      }),
      close: vi.fn(async () => {}),
      getData: () => data,
    };
  }

  function createMockFileHandle(name: string, dir: Map<string, any>) {
    return {
      kind: "file" as const,
      getFile: vi.fn(async () => {
        const content = dir.get(name);
        if (typeof content === "string") return new Blob([content], { type: "application/json" });
        return new Blob([""], { type: "application/json" });
      }),
      createWritable: vi.fn(async () => {
        const writable = createMockWritable();
        const origClose = writable.close;
        writable.close = vi.fn(async () => {
          const written = writable.getData();
          dir.set(name, written);
          await origClose();
        });
        return writable;
      }),
    };
  }

  function createMockDirHandle(store: Map<string, any>): any {
    return {
      kind: "directory" as const,
      getDirectoryHandle: vi.fn(async (name: string, opts?: { create?: boolean }) => {
        if (!store.has("__dir__" + name)) {
          if (opts?.create) {
            store.set("__dir__" + name, new Map());
          } else {
            throw new Error("Not found");
          }
        }
        return createMockDirHandle(store.get("__dir__" + name));
      }),
      getFileHandle: vi.fn(async (name: string, opts?: { create?: boolean }) => {
        if (!store.has(name) && !opts?.create) {
          throw new Error("Not found");
        }
        if (!store.has(name)) {
          store.set(name, "");
        }
        return createMockFileHandle(name, store);
      }),
      removeEntry: vi.fn(async (name: string) => {
        store.delete(name);
        store.delete("__dir__" + name);
      }),
    };
  }

  const rootStore = new Map<string, any>();
  const mockRoot = createMockDirHandle(rootStore);

  Object.defineProperty(navigator, "storage", {
    value: {
      getDirectory: vi.fn(async () => mockRoot),
    },
    configurable: true,
    writable: true,
  });
}

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
    for (let i = 0; i < 105; i++) {
      await repo.appendRun(makeRun({ id: `rr-${i}`, taskId, starttime: i }));
    }
    const runs = await repo.listRuns(taskId, 200);
    expect(runs.length).toBe(100);
    // 最新的在前，最老 5 条被裁剪掉（rr-0 ~ rr-4）
    expect(runs[0].id).toBe("rr-104");
    expect(runs[99].id).toBe("rr-5");
  });
});
