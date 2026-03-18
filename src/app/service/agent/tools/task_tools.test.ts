import { describe, it, expect } from "vitest";
import { createTaskTools } from "./task_tools";

describe("task_tools", () => {
  it("should create 5 tools", () => {
    const { tools } = createTaskTools();
    expect(tools).toHaveLength(5);
    const names = tools.map((t) => t.definition.name);
    expect(names).toEqual(["create_task", "get_task", "update_task", "list_tasks", "delete_task"]);
  });

  it("create_task should create a task with auto-incremented ID", async () => {
    const { tools } = createTaskTools();
    const create = tools.find((t) => t.definition.name === "create_task")!;

    const result1 = JSON.parse((await create.executor.execute({ subject: "Task 1" })) as string);
    expect(result1).toEqual({ id: "1", subject: "Task 1", status: "pending" });

    const result2 = JSON.parse(
      (await create.executor.execute({ subject: "Task 2", description: "Details" })) as string
    );
    expect(result2).toEqual({ id: "2", subject: "Task 2", description: "Details", status: "pending" });
  });

  it("get_task should return task or throw", async () => {
    const { tools } = createTaskTools();
    const create = tools.find((t) => t.definition.name === "create_task")!;
    const get = tools.find((t) => t.definition.name === "get_task")!;

    await create.executor.execute({ subject: "Test" });
    const result = JSON.parse((await get.executor.execute({ task_id: "1" })) as string);
    expect(result.subject).toBe("Test");

    await expect(get.executor.execute({ task_id: "999" })).rejects.toThrow('Task "999" not found');
  });

  it("update_task should update fields", async () => {
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

  it("update_task should throw for non-existent task", async () => {
    const { tools } = createTaskTools();
    const update = tools.find((t) => t.definition.name === "update_task")!;
    await expect(update.executor.execute({ task_id: "1" })).rejects.toThrow();
  });

  it("list_tasks should return all tasks summary", async () => {
    const { tools } = createTaskTools();
    const create = tools.find((t) => t.definition.name === "create_task")!;
    const list = tools.find((t) => t.definition.name === "list_tasks")!;

    await create.executor.execute({ subject: "A" });
    await create.executor.execute({ subject: "B" });

    const result = JSON.parse((await list.executor.execute({})) as string);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "1", subject: "A", status: "pending" });
    expect(result[1]).toEqual({ id: "2", subject: "B", status: "pending" });
  });

  it("list_tasks should return empty array initially", async () => {
    const { tools } = createTaskTools();
    const list = tools.find((t) => t.definition.name === "list_tasks")!;
    const result = JSON.parse((await list.executor.execute({})) as string);
    expect(result).toEqual([]);
  });

  it("update_task should allow clearing description with empty string", async () => {
    const { tools } = createTaskTools();
    const create = tools.find((t) => t.definition.name === "create_task")!;
    const update = tools.find((t) => t.definition.name === "update_task")!;

    await create.executor.execute({ subject: "Test", description: "Some desc" });

    const result = JSON.parse((await update.executor.execute({ task_id: "1", description: "" })) as string);
    expect(result.description).toBe("");
  });

  it("update_task with only task_id should not change anything", async () => {
    const { tools } = createTaskTools();
    const create = tools.find((t) => t.definition.name === "create_task")!;
    const update = tools.find((t) => t.definition.name === "update_task")!;

    await create.executor.execute({ subject: "Original", description: "Desc" });

    const result = JSON.parse((await update.executor.execute({ task_id: "1" })) as string);
    expect(result.subject).toBe("Original");
    expect(result.description).toBe("Desc");
    expect(result.status).toBe("pending");
  });

  it("create_task without description should not include it in result", async () => {
    const { tools } = createTaskTools();
    const create = tools.find((t) => t.definition.name === "create_task")!;

    const result = JSON.parse((await create.executor.execute({ subject: "No desc" })) as string);
    expect(result.description).toBeUndefined();
  });

  it("delete_task should remove a task", async () => {
    const { tools, tasks } = createTaskTools();
    const create = tools.find((t) => t.definition.name === "create_task")!;
    const del = tools.find((t) => t.definition.name === "delete_task")!;

    await create.executor.execute({ subject: "To delete" });
    expect(tasks.size).toBe(1);

    const result = JSON.parse((await del.executor.execute({ task_id: "1" })) as string);
    expect(result).toEqual({ deleted: "1" });
    expect(tasks.size).toBe(0);
  });

  it("delete_task should throw for non-existent task", async () => {
    const { tools } = createTaskTools();
    const del = tools.find((t) => t.definition.name === "delete_task")!;
    await expect(del.executor.execute({ task_id: "999" })).rejects.toThrow('Task "999" not found');
  });

  it("tasks map should be independent per createTaskTools call", async () => {
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
