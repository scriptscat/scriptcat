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
    expect(onSave).toHaveBeenCalledWith([{ id: "1", subject: "Test", status: "pending" }]);

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
