import { describe, it, expect, vi } from "vitest";
import { createTaskTools, type Task } from "./task_tools";

describe("task_tools", () => {
  it("应创建 3 个工具", () => {
    const { tools } = createTaskTools();
    expect(tools).toHaveLength(3);
    const names = tools.map((t) => t.definition.name);
    expect(names).toEqual(["create_task", "update_task", "list_tasks"]);
  });

  it("create_task 应创建自增 ID 的任务", async () => {
    const { tools } = createTaskTools();
    const create = tools.find((t) => t.definition.name === "create_task")!;

    const result1 = JSON.parse((await create.executor.execute({ subject: "Task 1" })) as string);
    expect(result1).toEqual({ id: "1", subject: "Task 1", status: "pending" });

    const result2 = JSON.parse(
      (await create.executor.execute({ subject: "Task 2", description: "Details" })) as string
    );
    expect(result2).toEqual({ id: "2", subject: "Task 2", description: "Details", status: "pending" });
  });

  it("中止时不应创建任务、持久化或发送更新", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const sendEvent = vi.fn();
    const { tools, tasks } = createTaskTools({ onSave, sendEvent });
    const create = tools.find((tool) => tool.definition.name === "create_task")!;
    const controller = new AbortController();
    controller.abort();

    await expect(create.executor.execute({ subject: "不应创建" }, controller.signal)).rejects.toThrow("Aborted");
    expect(tasks.size).toBe(0);
    expect(onSave).not.toHaveBeenCalled();
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it("onSave 应收到透传的 AbortSignal，Stop 后底层写入可拒绝提交", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { tools } = createTaskTools({ onSave });
    const create = tools.find((tool) => tool.definition.name === "create_task")!;
    const controller = new AbortController();

    await create.executor.execute({ subject: "任务" }, controller.signal);

    expect(onSave).toHaveBeenCalledWith(expect.any(Array), controller.signal);
  });

  it("create_task 持久化失败时不应把未提交任务留在内存或消耗 ID", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const { tools, tasks } = createTaskTools({ onSave });
    const create = tools.find((tool) => tool.definition.name === "create_task")!;

    await expect(create.executor.execute({ subject: "失败任务" })).rejects.toThrow("disk full");
    expect(tasks.size).toBe(0);

    const committed = JSON.parse((await create.executor.execute({ subject: "成功任务" })) as string);
    expect(committed.id).toBe("1");
  });

  it("update_task 应更新任务字段", async () => {
    const { tools } = createTaskTools();
    const create = tools.find((t) => t.definition.name === "create_task")!;
    const update = tools.find((t) => t.definition.name === "update_task")!;

    await create.executor.execute({ subject: "Original" });

    const result = JSON.parse(
      (await update.executor.execute({ task_id: "1", status: "in_progress", subject: "Updated" })) as string
    );
    expect(result.status).toBe("in_progress");
    expect(result.subject).toBe("Updated");
  });

  it("update_task 持久化失败时不应污染内存中的已提交任务", async () => {
    const onSave = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disk full"));
    const { tools, tasks } = createTaskTools({ onSave });
    const create = tools.find((tool) => tool.definition.name === "create_task")!;
    const update = tools.find((tool) => tool.definition.name === "update_task")!;

    await create.executor.execute({ subject: "Original" });
    await expect(
      update.executor.execute({ task_id: "1", status: "completed", subject: "Uncommitted" })
    ).rejects.toThrow("disk full");

    expect(tasks.get("1")).toEqual({ id: "1", subject: "Original", status: "pending" });
  });

  it("持久化落定时同时发生中止也应保持磁盘与内存状态一致", async () => {
    const controller = new AbortController();
    let persisted: Task[] = [];
    const onSave = vi.fn(async (candidate: Task[]) => {
      persisted = candidate.map((task) => ({ ...task }));
      controller.abort();
    });
    const { tools, tasks } = createTaskTools({ onSave });
    const create = tools.find((tool) => tool.definition.name === "create_task")!;

    await create.executor.execute({ subject: "已提交任务" }, controller.signal);

    expect(persisted).toEqual([{ id: "1", subject: "已提交任务", status: "pending" }]);
    expect(Array.from(tasks.values())).toEqual(persisted);
  });

  it("通知失败不应回滚已提交任务或复用已消耗的 ID", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const sendEvent = vi.fn().mockImplementationOnce(() => {
      throw new Error("port closed");
    });
    const { tools, tasks } = createTaskTools({ onSave, sendEvent });
    const create = tools.find((tool) => tool.definition.name === "create_task")!;

    await create.executor.execute({ subject: "任务一" });
    const second = JSON.parse((await create.executor.execute({ subject: "任务二" })) as string);

    expect(second.id).toBe("2");
    expect(Array.from(tasks.keys())).toEqual(["1", "2"]);
  });

  it("update_task 应对不存在的任务抛错", async () => {
    const { tools } = createTaskTools();
    const update = tools.find((t) => t.definition.name === "update_task")!;
    await expect(update.executor.execute({ task_id: "1" })).rejects.toThrow();
  });

  it("list_tasks 应返回所有任务完整信息", async () => {
    const { tools } = createTaskTools();
    const create = tools.find((t) => t.definition.name === "create_task")!;
    const list = tools.find((t) => t.definition.name === "list_tasks")!;

    await create.executor.execute({ subject: "A" });
    await create.executor.execute({ subject: "B", description: "Details" });

    const result = JSON.parse((await list.executor.execute({})) as string);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "1", subject: "A", status: "pending" });
    expect(result[1]).toEqual({ id: "2", subject: "B", description: "Details", status: "pending" });
  });

  it("list_tasks 初始应返回空数组", async () => {
    const { tools } = createTaskTools();
    const list = tools.find((t) => t.definition.name === "list_tasks")!;
    const result = JSON.parse((await list.executor.execute({})) as string);
    expect(result).toEqual([]);
  });

  it("应从 initialTasks 恢复任务并继续递增 ID", async () => {
    const initial: Task[] = [
      { id: "3", subject: "Existing", status: "in_progress" },
      { id: "5", subject: "Another", status: "pending" },
    ];
    const { tools } = createTaskTools({ initialTasks: initial });
    const create = tools.find((t) => t.definition.name === "create_task")!;
    const list = tools.find((t) => t.definition.name === "list_tasks")!;

    // 新任务 ID 应从 6 开始（max existing ID 5 + 1）
    const result = JSON.parse((await create.executor.execute({ subject: "New" })) as string);
    expect(result.id).toBe("6");

    const all = JSON.parse((await list.executor.execute({})) as string);
    expect(all).toHaveLength(3);
  });

  it("create_task 应调用 onSave 和 sendEvent", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const sendEvent = vi.fn();
    const { tools } = createTaskTools({ onSave, sendEvent });
    const create = tools.find((t) => t.definition.name === "create_task")!;

    await create.executor.execute({ subject: "Test" });

    expect(onSave).toHaveBeenCalledOnce();
    // 第二个参数是透传给底层写入的 AbortSignal，未传 signal 时为 undefined
    expect(onSave).toHaveBeenCalledWith([{ id: "1", subject: "Test", status: "pending" }], undefined);

    expect(sendEvent).toHaveBeenCalledOnce();
    expect(sendEvent).toHaveBeenCalledWith({
      type: "task_update",
      tasks: [{ id: "1", subject: "Test", status: "pending" }],
    });
  });

  it("update_task 应调用 onSave 和 sendEvent", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const sendEvent = vi.fn();
    const { tools } = createTaskTools({ onSave, sendEvent });
    const create = tools.find((t) => t.definition.name === "create_task")!;
    const update = tools.find((t) => t.definition.name === "update_task")!;

    await create.executor.execute({ subject: "Task" });
    onSave.mockClear();
    sendEvent.mockClear();

    await update.executor.execute({ task_id: "1", status: "completed" });

    expect(onSave).toHaveBeenCalledOnce();
    expect(sendEvent).toHaveBeenCalledOnce();
    expect(sendEvent).toHaveBeenCalledWith({
      type: "task_update",
      tasks: [{ id: "1", subject: "Task", status: "completed" }],
    });
  });

  it("list_tasks 不应触发 onSave 或 sendEvent", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const sendEvent = vi.fn();
    const initial: Task[] = [{ id: "1", subject: "Existing", status: "pending" }];
    const { tools } = createTaskTools({ initialTasks: initial, onSave, sendEvent });
    const list = tools.find((t) => t.definition.name === "list_tasks")!;

    await list.executor.execute({});

    expect(onSave).not.toHaveBeenCalled();
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it("多实例应独立", async () => {
    const instance1 = createTaskTools();
    const instance2 = createTaskTools();

    const create1 = instance1.tools.find((t) => t.definition.name === "create_task")!;
    const list2 = instance2.tools.find((t) => t.definition.name === "list_tasks")!;

    await create1.executor.execute({ subject: "Only in instance1" });

    const result = JSON.parse((await list2.executor.execute({})) as string);
    expect(result).toEqual([]);
    expect(instance1.tasks.size).toBe(1);
    expect(instance2.tasks.size).toBe(0);
  });
});
