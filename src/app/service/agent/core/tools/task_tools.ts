import type { ToolDefinition, ChatStreamEvent } from "@App/app/service/agent/core/types";
import type { ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import { throwIfAborted } from "../abort_utils";
import { requireString, optionalString } from "./param_utils";

export type Task = {
  id: string;
  subject: string;
  description?: string;
  status: "pending" | "in_progress" | "completed";
};

const CREATE_TASK_DEFINITION: ToolDefinition = {
  name: "create_task",
  description: "Create a new task. Returns the created task with an auto-assigned ID and status 'pending'.",
  parameters: {
    type: "object",
    properties: {
      subject: {
        type: "string",
        description: "Brief, actionable title in imperative form (e.g., 'Extract product prices from page')",
      },
      description: {
        type: "string",
        description: "Detailed description including context and acceptance criteria",
      },
    },
    required: ["subject"],
  },
};

const UPDATE_TASK_DEFINITION: ToolDefinition = {
  name: "update_task",
  description: "Update a task's status or details. Can change status, subject, and description.",
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
  description: "List all tasks with full details (ID, subject, status, description).",
  parameters: {
    type: "object",
    properties: {},
  },
};

export type TaskToolsOptions = {
  // 初始任务列表（从持久化加载）
  initialTasks?: Task[];
  // 任务变更时的持久化回调；signal 透传到底层写入，Stop 后不再提交任务快照（见 finding 4）
  onSave?: (tasks: Task[], signal?: AbortSignal) => Promise<void>;
  // 任务变更时的事件推送回调（推送到 UI）
  sendEvent?: (event: ChatStreamEvent) => void;
};

export function createTaskTools(options?: TaskToolsOptions): {
  tools: Array<{ definition: ToolDefinition; executor: ToolExecutor }>;
  tasks: Map<string, Task>;
} {
  const tasks = new Map<string, Task>();
  let nextId = 1;
  let mutationQueue = Promise.resolve();

  // 从持久化数据恢复
  if (options?.initialTasks) {
    for (const task of options.initialTasks) {
      tasks.set(task.id, { ...task });
      const numId = parseInt(task.id, 10);
      if (!isNaN(numId) && numId >= nextId) {
        nextId = numId + 1;
      }
    }
  }

  const runMutation = <T>(mutation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.then(mutation, mutation);
    mutationQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  // 先持久化候选快照，成功后才替换内存状态并推送事件。
  const emitTaskUpdate = (taskList: Task[]) => {
    try {
      options?.sendEvent?.({
        type: "task_update",
        tasks: taskList.map((task) => ({
          id: task.id,
          subject: task.subject,
          status: task.status,
          description: task.description,
        })),
      });
    } catch {
      // 持久化已经落定；连接关闭等通知失败不能把已提交的工具操作伪装成失败。
    }
  };

  const commitUpdate = async (candidate: Map<string, Task>, signal?: AbortSignal): Promise<Task[]> => {
    const taskList = Array.from(candidate.values(), (task) => ({ ...task }));
    throwIfAborted(signal);
    if (options?.onSave) {
      await options.onSave(taskList, signal);
    }
    // onSave resolve 表示候选快照已经提交。即使 signal 恰好在 close() 落定后 abort，
    // 内存也必须接受同一份快照，不能制造“磁盘已提交、内存仍回滚”的分叉状态。
    tasks.clear();
    for (const task of taskList) tasks.set(task.id, task);
    return taskList;
  };

  const createExecutor: ToolExecutor = {
    execute: (args: Record<string, unknown>, signal?: AbortSignal) =>
      runMutation(async () => {
        throwIfAborted(signal);
        const task: Task = {
          id: String(nextId),
          subject: requireString(args, "subject"),
          description: optionalString(args, "description"),
          status: "pending",
        };
        const candidate = new Map(tasks);
        candidate.set(task.id, task);
        const committed = await commitUpdate(candidate, signal);
        nextId++;
        emitTaskUpdate(committed);
        return JSON.stringify(task);
      }),
  };

  const updateExecutor: ToolExecutor = {
    execute: (args: Record<string, unknown>, signal?: AbortSignal) =>
      runMutation(async () => {
        throwIfAborted(signal);
        const taskId = requireString(args, "task_id");
        const existing = tasks.get(taskId);
        if (!existing) {
          throw new Error(`Task "${taskId}" not found`);
        }
        const task = { ...existing };
        if (args.status) task.status = args.status as Task["status"];
        if (args.subject) task.subject = args.subject as string;
        if (args.description !== undefined) task.description = args.description as string;
        const candidate = new Map(tasks);
        candidate.set(taskId, task);
        const committed = await commitUpdate(candidate, signal);
        emitTaskUpdate(committed);
        return JSON.stringify(task);
      }),
  };

  const listExecutor: ToolExecutor = {
    execute: async (_args: Record<string, unknown>, signal?: AbortSignal) => {
      throwIfAborted(signal);
      return JSON.stringify(Array.from(tasks.values()));
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
