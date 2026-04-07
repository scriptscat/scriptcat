import { describe, expect, it, beforeEach, vi } from "vitest";
import { AgentTaskScheduler } from "./task_scheduler";
import { AgentTaskRepo, AgentTaskRunRepo } from "@App/app/repo/agent_task";
import type { AgentTask } from "@App/app/service/agent/core/types";

// Mock OPFS 文件系统（AgentTaskRunRepo 使用 OPFS 存储）
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
          dir.set(name, writable.getData());
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
          if (opts?.create) store.set("__dir__" + name, new Map());
          else throw new Error("Not found");
        }
        return createMockDirHandle(store.get("__dir__" + name));
      }),
      getFileHandle: vi.fn(async (name: string, opts?: { create?: boolean }) => {
        if (!store.has(name) && !opts?.create) throw new Error("Not found");
        if (!store.has(name)) store.set(name, "");
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
    value: { getDirectory: vi.fn(async () => mockRoot) },
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
    prompt: "",
    enabled: true,
    notify: false,
    createtime: Date.now(),
    updatetime: Date.now(),
    ...overrides,
  } as AgentTask;
}

describe("AgentTaskScheduler", () => {
  let repo: AgentTaskRepo;
  let runRepo: AgentTaskRunRepo;
  let internalExecutor: ReturnType<
    typeof vi.fn<
      (task: AgentTask) => Promise<{ conversationId: string; usage?: { inputTokens: number; outputTokens: number } }>
    >
  >;
  let eventEmitter: ReturnType<typeof vi.fn<(task: AgentTask) => Promise<void>>>;
  let scheduler: AgentTaskScheduler;

  beforeEach(() => {
    createMockOPFS();
    repo = new AgentTaskRepo();
    runRepo = new AgentTaskRunRepo();
    internalExecutor = vi
      .fn()
      .mockResolvedValue({ conversationId: "conv-1", usage: { inputTokens: 100, outputTokens: 50 } });
    eventEmitter = vi.fn().mockResolvedValue(undefined);
    scheduler = new AgentTaskScheduler(repo, runRepo, internalExecutor, eventEmitter);
  });

  it("init 加载并计算 nextruntime", async () => {
    const task = makeTask({ id: "init-1", nextruntime: undefined });
    await repo.saveTask(task);

    await scheduler.init();

    const updated = await repo.getTask("init-1");
    expect(updated).toBeDefined();
    expect(updated!.nextruntime).toBeGreaterThan(Date.now() - 1000);
  });

  it("tick 执行到期任务", async () => {
    const task = makeTask({ id: "tick-1", nextruntime: Date.now() - 1000 });
    await repo.saveTask(task);

    await scheduler.tick();

    // 等待异步执行完成
    await vi.waitFor(async () => {
      expect(internalExecutor).toHaveBeenCalledTimes(1);
    });
  });

  it("tick 跳过未到期任务", async () => {
    const task = makeTask({ id: "skip-1", nextruntime: Date.now() + 60_000 });
    await repo.saveTask(task);

    await scheduler.tick();

    expect(internalExecutor).not.toHaveBeenCalled();
  });

  it("tick 跳过 disabled 任务", async () => {
    const task = makeTask({ id: "disabled-1", enabled: false, nextruntime: Date.now() - 1000 });
    await repo.saveTask(task);

    await scheduler.tick();

    expect(internalExecutor).not.toHaveBeenCalled();
  });

  it("tick 跳过正在运行的任务", async () => {
    // 让 executor 永远 pending
    internalExecutor.mockReturnValue(new Promise(() => {}));

    const task = makeTask({ id: "running-1", nextruntime: Date.now() - 1000 });
    await repo.saveTask(task);

    await scheduler.tick();

    // 等待 executor 被调用（表明已经过 appendRun）
    await vi.waitFor(() => {
      expect(internalExecutor).toHaveBeenCalledTimes(1);
    });
    expect(scheduler.isRunning("running-1")).toBe(true);

    // 再次 tick 不应重复执行
    await scheduler.tick();
    expect(internalExecutor).toHaveBeenCalledTimes(1);
  });

  it("internal 模式调 internalExecutor", async () => {
    const task = makeTask({ id: "internal-1", mode: "internal", nextruntime: Date.now() - 1000 });
    await repo.saveTask(task);

    await scheduler.executeTask(task);

    expect(internalExecutor).toHaveBeenCalledTimes(1);
    expect(internalExecutor).toHaveBeenCalledWith(expect.objectContaining({ id: "internal-1" }));
    expect(eventEmitter).not.toHaveBeenCalled();

    // 检查 run 记录
    const runs = await runRepo.listRuns("internal-1");
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("success");
    expect(runs[0].conversationId).toBe("conv-1");
    expect(runs[0].usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it("event 模式调 eventEmitter", async () => {
    const task = makeTask({ id: "event-1", mode: "event", nextruntime: Date.now() - 1000 });
    await repo.saveTask(task);

    await scheduler.executeTask(task);

    expect(eventEmitter).toHaveBeenCalledTimes(1);
    expect(internalExecutor).not.toHaveBeenCalled();

    const runs = await runRepo.listRuns("event-1");
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("success");
  });

  it("执行失败更新 error 状态", async () => {
    internalExecutor.mockRejectedValue(new Error("LLM 调用失败"));

    const task = makeTask({ id: "error-1", nextruntime: Date.now() - 1000 });
    await repo.saveTask(task);

    await scheduler.executeTask(task);

    const runs = await runRepo.listRuns("error-1");
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("error");
    expect(runs[0].error).toBe("LLM 调用失败");

    const updatedTask = await repo.getTask("error-1");
    expect(updatedTask!.lastRunStatus).toBe("error");
    expect(updatedTask!.lastRunError).toBe("LLM 调用失败");
  });

  it("执行完成后更新 nextruntime", async () => {
    const task = makeTask({ id: "next-1", nextruntime: Date.now() - 1000 });
    await repo.saveTask(task);

    await scheduler.executeTask(task);

    const updated = await repo.getTask("next-1");
    expect(updated!.nextruntime).toBeGreaterThan(Date.now() - 1000);
    expect(updated!.lastruntime).toBeDefined();
  });

  it("appendRun 抛错时，task.id 应从 runningTasks 移除", async () => {
    runRepo.appendRun = vi.fn().mockRejectedValue(new Error("storage quota exceeded"));

    const task = makeTask({ id: "append-fail-1", nextruntime: Date.now() - 1000 });
    await repo.saveTask(task);

    // 第一次 executeTask 时 appendRun 抛错，应不再阻塞任务
    await expect(scheduler.executeTask(task)).rejects.toThrow("storage quota exceeded");

    // task.id 应已从 runningTasks 移除
    expect(scheduler.isRunning("append-fail-1")).toBe(false);

    // 第二次调用应能正常进入（不被跳过）
    runRepo.appendRun = vi.fn().mockResolvedValue(undefined);
    internalExecutor.mockResolvedValue({ conversationId: "conv-2", usage: { inputTokens: 200, outputTokens: 100 } });

    // 应能成功执行而不被 runningTasks.has() 阻挡
    await scheduler.executeTask(task);
    expect(internalExecutor).toHaveBeenCalled();
  });
});
