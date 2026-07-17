import GMContext from "./gm_context";
import type {
  AgentTask,
  AgentTaskApiRequest,
  AgentTaskTrigger,
  InternalAgentTask,
  EventAgentTask,
} from "@App/app/service/agent/core/types";
import type EventEmitter from "eventemitter3";

// 运行时 this 是 GM_Base 实例
interface GMBaseContext {
  sendMessage: (api: string, params: unknown[]) => Promise<unknown>;
  scriptRes?: { uuid: string };
  EE?: EventEmitter | null;
}

// 内部 listener 计数器
let listenerCounter = 0;
// listener id → { eventName, callback } 映射，供 removeListener 使用
const listenerMap = new Map<number, { eventName: string; callback: (...args: any[]) => void }>();

// CAT.agent.task API，注入到脚本上下文
export default class CATAgentTaskApi {
  @GMContext.protected()
  protected sendMessage!: (api: string, params: any[]) => Promise<any>;

  @GMContext.protected()
  protected scriptRes?: any;

  @GMContext.protected()
  protected EE?: EventEmitter | null;

  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.create"(
    options:
      | Omit<InternalAgentTask, "id" | "createtime" | "updatetime" | "nextruntime">
      | Omit<EventAgentTask, "id" | "createtime" | "updatetime" | "nextruntime" | "sourceScriptUuid">
  ): Promise<AgentTask> {
    const ctx = this as unknown as GMBaseContext;
    // event 模式：自动注入 sourceScriptUuid（脚本无需手动传入）
    const task =
      options.mode === "event" ? { ...options, sourceScriptUuid: ctx.scriptRes?.uuid || "" } : { ...options };
    return ctx.sendMessage("CAT_agentTask", [
      {
        action: "create",
        task,
      } as AgentTaskApiRequest,
    ]) as Promise<AgentTask>;
  }

  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.list"(): Promise<AgentTask[]> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentTask", [{ action: "list" } as AgentTaskApiRequest]) as Promise<AgentTask[]>;
  }

  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.get"(id: string): Promise<AgentTask | undefined> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentTask", [{ action: "get", id } as AgentTaskApiRequest]) as Promise<
      AgentTask | undefined
    >;
  }

  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.update"(id: string, task: Partial<AgentTask>): Promise<AgentTask> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentTask", [
      { action: "update", id, task } as AgentTaskApiRequest,
    ]) as Promise<AgentTask>;
  }

  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.remove"(id: string): Promise<boolean> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentTask", [{ action: "delete", id } as AgentTaskApiRequest]) as Promise<boolean>;
  }

  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.runNow"(id: string): Promise<void> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentTask", [{ action: "runNow", id } as AgentTaskApiRequest]) as Promise<void>;
  }

  // 监听任务触发事件
  // 利用 EE.on("agentTask:{taskId}", callback) 注册监听
  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.addListener"(taskId: string, callback: (trigger: AgentTaskTrigger) => void): number {
    const ctx = this as unknown as GMBaseContext;
    if (!ctx.EE) return 0;

    const listenerId = ++listenerCounter;
    const eventName = `agentTask:${taskId}`;

    const wrappedCallback = (data: AgentTaskTrigger) => {
      callback(data);
    };

    ctx.EE.on(eventName, wrappedCallback);
    listenerMap.set(listenerId, { eventName, callback: wrappedCallback });

    return listenerId;
  }

  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.removeListener"(listenerId: number): void {
    const ctx = this as unknown as GMBaseContext;
    if (!ctx.EE) return;

    const entry = listenerMap.get(listenerId);
    if (entry) {
      ctx.EE.off(entry.eventName, entry.callback);
      listenerMap.delete(listenerId);
    }
  }
}
