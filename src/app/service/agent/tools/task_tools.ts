import type { ToolDefinition } from "@App/app/service/agent/types";
import type { ToolExecutor } from "@App/app/service/agent/tool_registry";

export type Task = {
  id: string;
  subject: string;
  description?: string;
  status: "pending" | "in_progress" | "completed";
};

const CREATE_TASK_DEFINITION: ToolDefinition = {
  name: "create_task",
  description: "Create a new task to track work. Returns the created task with an auto-assigned ID.",
  parameters: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Brief title for the task" },
      description: { type: "string", description: "Detailed description of what needs to be done" },
    },
    required: ["subject"],
  },
};

const GET_TASK_DEFINITION: ToolDefinition = {
  name: "get_task",
  description: "Get the full details of a task by its ID.",
  parameters: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "The task ID" },
    },
    required: ["task_id"],
  },
};

const UPDATE_TASK_DEFINITION: ToolDefinition = {
  name: "update_task",
  description: "Update a task's status, subject, or description.",
  parameters: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "The task ID" },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed"],
        description: "New status for the task",
      },
      subject: { type: "string", description: "New subject for the task" },
      description: { type: "string", description: "New description for the task" },
    },
    required: ["task_id"],
  },
};

const LIST_TASKS_DEFINITION: ToolDefinition = {
  name: "list_tasks",
  description: "List all tasks with their IDs, subjects, and statuses.",
  parameters: {
    type: "object",
    properties: {},
  },
};

const DELETE_TASK_DEFINITION: ToolDefinition = {
  name: "delete_task",
  description: "Delete a task by its ID. The task is permanently removed.",
  parameters: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "The task ID to delete" },
    },
    required: ["task_id"],
  },
};

export function createTaskTools(): {
  tools: Array<{ definition: ToolDefinition; executor: ToolExecutor }>;
  tasks: Map<string, Task>;
} {
  const tasks = new Map<string, Task>();
  let nextId = 1;

  const createExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const task: Task = {
        id: String(nextId++),
        subject: args.subject as string,
        description: args.description as string | undefined,
        status: "pending",
      };
      tasks.set(task.id, task);
      return JSON.stringify(task);
    },
  };

  const getExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const task = tasks.get(args.task_id as string);
      if (!task) {
        throw new Error(`Task "${args.task_id}" not found`);
      }
      return JSON.stringify(task);
    },
  };

  const updateExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const task = tasks.get(args.task_id as string);
      if (!task) {
        throw new Error(`Task "${args.task_id}" not found`);
      }
      if (args.status) task.status = args.status as Task["status"];
      if (args.subject) task.subject = args.subject as string;
      if (args.description !== undefined) task.description = args.description as string;
      return JSON.stringify(task);
    },
  };

  const listExecutor: ToolExecutor = {
    execute: async () => {
      const list = Array.from(tasks.values()).map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
      }));
      return JSON.stringify(list);
    },
  };

  const deleteExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const taskId = args.task_id as string;
      if (!tasks.has(taskId)) {
        throw new Error(`Task "${taskId}" not found`);
      }
      tasks.delete(taskId);
      return JSON.stringify({ deleted: taskId });
    },
  };

  return {
    tools: [
      { definition: CREATE_TASK_DEFINITION, executor: createExecutor },
      { definition: GET_TASK_DEFINITION, executor: getExecutor },
      { definition: UPDATE_TASK_DEFINITION, executor: updateExecutor },
      { definition: LIST_TASKS_DEFINITION, executor: listExecutor },
      { definition: DELETE_TASK_DEFINITION, executor: deleteExecutor },
    ],
    tasks,
  };
}
