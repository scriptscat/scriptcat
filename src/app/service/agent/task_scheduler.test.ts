import { describe, expect, it, beforeEach, vi } from "vitest";
import { AgentTaskScheduler } from "./task_scheduler";
import { AgentTaskRepo, AgentTaskRunRepo } from "@App/app/repo/agent_task";
import type { AgentTask } from "@App/app/service/agent/types";

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

    // 等待第一次执行开始
    await vi.waitFor(() => {
      expect(scheduler.isRunning("running-1")).toBe(true);
    });

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
