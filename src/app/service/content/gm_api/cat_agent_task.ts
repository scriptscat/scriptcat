import GMContext from "./gm_context";
import type {
  AgentTask,
  AgentTaskApiRequest,
  AgentTaskTrigger,
  InternalAgentTask,
  EventAgentTask,
} from "@App/app/service/agent/core/types";
import type EventEmitter from "eventemitter3";
import { Native } from "../global";

// API 显式接收 GM_Base 上下文。
interface GMBaseContext {
  sendMessage: (api: string, params: unknown[]) => Promise<unknown>;
  scriptRes?: { uuid: string };
  EE?: EventEmitter | null;
}

// 内部 listener 计数器
let listenerCounter = 0;
type ListenerRecord = { id: number; eventName: string; callback: (...args: any[]) => void };
const listenerMaps = new Native.WeakMap<object, Map<number, ListenerRecord>>();

const getListenerRecords = (owner: object): Map<number, ListenerRecord> => {
  let records = listenerMaps.get(owner);
  if (!records) {
    records = new Native.Map<number, ListenerRecord>();
    listenerMaps.set(owner, records);
  }
  return records;
};

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
    ctx: GMBaseContext,
    options:
      | Omit<InternalAgentTask, "id" | "createtime" | "updatetime" | "nextruntime">
      | Omit<EventAgentTask, "id" | "createtime" | "updatetime" | "nextruntime" | "sourceScriptUuid">
  ): Promise<AgentTask> {
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
  public "CAT.agent.task.list"(ctx: GMBaseContext): Promise<AgentTask[]> {
    return ctx.sendMessage("CAT_agentTask", [{ action: "list" } as AgentTaskApiRequest]) as Promise<AgentTask[]>;
  }

  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.get"(ctx: GMBaseContext, id: string): Promise<AgentTask | undefined> {
    return ctx.sendMessage("CAT_agentTask", [{ action: "get", id } as AgentTaskApiRequest]) as Promise<
      AgentTask | undefined
    >;
  }

  // task 必须携带 get()/list() 返回的 generation/revision（乐观并发版本号），
  // 否则服务端无法区分"修改的是当前这个任务"还是"ID 被删除重建后的另一个任务"
  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.update"(ctx: GMBaseContext, id: string, task: Partial<AgentTask>): Promise<AgentTask> {
    if (task.generation === undefined || task.revision === undefined) {
      throw new Error(
        "CAT.agent.task.update: task must include the generation/revision returned by CAT.agent.task.get() or list() — spread the fetched task before applying changes."
      );
    }
    return ctx.sendMessage("CAT_agentTask", [
      { action: "update", id, generation: task.generation, revision: task.revision, task } as AgentTaskApiRequest,
    ]) as Promise<AgentTask>;
  }

  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.remove"(
    ctx: GMBaseContext,
    id: string,
    task: Pick<AgentTask, "generation" | "revision">
  ): Promise<boolean> {
    if (task?.generation === undefined || task?.revision === undefined) {
      throw new Error(
        "CAT.agent.task.remove: task must include the generation/revision returned by CAT.agent.task.get() or list()."
      );
    }
    return ctx.sendMessage("CAT_agentTask", [
      { action: "delete", id, generation: task.generation, revision: task.revision } as AgentTaskApiRequest,
    ]) as Promise<boolean>;
  }

  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.runNow"(ctx: GMBaseContext, id: string): Promise<void> {
    return ctx.sendMessage("CAT_agentTask", [{ action: "runNow", id } as AgentTaskApiRequest]) as Promise<void>;
  }

  // 监听任务触发事件
  // 利用 EE.on("agentTask:{taskId}", callback) 注册监听
  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.addListener"(
    ctx: GMBaseContext,
    taskId: string,
    callback: (trigger: AgentTaskTrigger) => void
  ): number {
    if (!ctx.EE) return 0;

    const listenerId = ++listenerCounter;
    const eventName = `agentTask:${taskId}`;

    const wrappedCallback = (data: AgentTaskTrigger) => {
      callback(data);
    };

    ctx.EE.on(eventName, wrappedCallback);
    getListenerRecords(ctx).set(listenerId, { id: listenerId, eventName, callback: wrappedCallback });

    return listenerId;
  }

  @GMContext.API({ follow: "CAT.agent.task" })
  public "CAT.agent.task.removeListener"(ctx: GMBaseContext, listenerId: number): void {
    if (!ctx.EE) return;

    const records = getListenerRecords(ctx);
    const entry = records.get(listenerId);
    if (entry) {
      records.delete(listenerId);
      ctx.EE.off(entry.eventName, entry.callback);
    }
  }
}
