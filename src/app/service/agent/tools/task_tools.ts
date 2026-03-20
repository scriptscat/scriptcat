import type { ToolDefinition, ChatStreamEvent } from "@App/app/service/agent/types";
import type { ToolExecutor } from "@App/app/service/agent/tool_registry";

export type Task = {
  id: string;
  subject: string;
  description?: string;
  status: "pending" | "in_progress" | "completed";
};

const CREATE_TASK_DEFINITION: ToolDefinition = {
  name: "create_task",
  description:
    "Create a new task to track work progress. Use this to break complex, multi-step work into trackable steps. Returns the created task with an auto-assigned ID.",
  parameters: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Brief title for the task" },
      description: { type: "string", description: "Detailed description of what needs to be done" },
    },
    required: ["subject"],
  },
};

const UPDATE_TASK_DEFINITION: ToolDefinition = {
  name: "update_task",
  description:
    'Update a task\'s status or details. Set status to "in_progress" when starting work, "completed" when done.',
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
  description: "List all tasks with their IDs, subjects, and statuses. Use to review remaining work.",
  parameters: {
    type: "object",
    properties: {},
  },
};

export type TaskToolsOptions = {
  // 初始任务列表（从持久化加载）
  initialTasks?: Task[];
  // 任务变更时的持久化回调
  onSave?: (tasks: Task[]) => Promise<void>;
  // 任务变更时的事件推送回调（推送到 UI）
  sendEvent?: (event: ChatStreamEvent) => void;
};

export function createTaskTools(options?: TaskToolsOptions): {
  tools: Array<{ definition: ToolDefinition; executor: ToolExecutor }>;
  tasks: Map<string, Task>;
} {
  const tasks = new Map<string, Task>();
  let nextId = 1;

  // 从持久化数据恢复
  if (options?.initialTasks) {
    for (const task of options.initialTasks) {
      tasks.set(task.id, task);
      const numId = parseInt(task.id, 10);
      if (!isNaN(numId) && numId >= nextId) {
        nextId = numId + 1;
      }
    }
  }

  // 持久化并推送事件
  const emitUpdate = async () => {
    const taskList = Array.from(tasks.values());
    if (options?.onSave) {
      await options.onSave(taskList);
    }
    if (options?.sendEvent) {
      options.sendEvent({
        type: "task_update",
        tasks: taskList.map((t) => ({
          id: t.id,
          subject: t.subject,
          status: t.status,
          description: t.description,
        })),
      });
    }
  };

  const createExecutor: ToolExecutor = {
    execute: async (args: Record<string, unknown>) => {
      const task: Task = {
        id: String(nextId++),
        subject: args.subject as string,
        description: args.description as string | undefined,
        status: "pending",
      };
      tasks.set(task.id, task);
      await emitUpdate();
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
      await emitUpdate();
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

  return {
    tools: [
      { definition: CREATE_TASK_DEFINITION, executor: createExecutor },
      { definition: UPDATE_TASK_DEFINITION, executor: updateExecutor },
      { definition: LIST_TASKS_DEFINITION, executor: listExecutor },
    ],
    tasks,
  };
}
