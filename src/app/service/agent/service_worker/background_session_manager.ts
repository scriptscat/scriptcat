import type { IGetSender } from "@Packages/message/server";
import { GetSenderType } from "@Packages/message/server";
import type { ChatStreamEvent, ToolCall } from "@App/app/service/agent/core/types";

// 后台运行会话的 listener 条目
export type ListenerEntry = {
  sendEvent: (event: ChatStreamEvent) => void;
};

// 后台运行会话状态
export type RunningConversation = {
  conversationId: string;
  abortController: AbortController;
  listeners: Set<ListenerEntry>;
  streamingState: { content: string; thinking: string; toolCalls: ToolCall[] };
  pendingAskUser?: { id: string; question: string; options?: string[]; multiple?: boolean };
  askResolvers: Map<string, (answer: string) => void>;
  tasks: Array<{ id: string; subject: string; status: "pending" | "in_progress" | "completed"; description?: string }>;
  status: "running" | "done" | "error";
};

// 后台会话注册表：管理流式状态快照、listener 广播、UI 附加逻辑
export class BackgroundSessionManager {
  private runningConversations = new Map<string, RunningConversation>();

  has(conversationId: string): boolean {
    return this.runningConversations.has(conversationId);
  }

  get(conversationId: string): RunningConversation | undefined {
    return this.runningConversations.get(conversationId);
  }

  set(conversationId: string, rc: RunningConversation): void {
    this.runningConversations.set(conversationId, rc);
  }

  delete(conversationId: string): void {
    this.runningConversations.delete(conversationId);
  }

  listIds(): string[] {
    return Array.from(this.runningConversations.keys());
  }

  // 更新后台会话的流式状态快照
  updateStreamingState(rc: RunningConversation, event: ChatStreamEvent) {
    // 子代理事件不更新父会话的流式状态
    if ("subAgent" in event && event.subAgent) return;
    switch (event.type) {
      case "content_delta":
        rc.streamingState.content += event.delta;
        break;
      case "thinking_delta":
        rc.streamingState.thinking += event.delta;
        break;
      case "tool_call_start":
        rc.streamingState.toolCalls.push({ ...event.toolCall, status: "running" });
        break;
      case "tool_call_delta":
        if (rc.streamingState.toolCalls.length > 0) {
          const last = rc.streamingState.toolCalls[rc.streamingState.toolCalls.length - 1];
          last.arguments += event.delta;
        }
        break;
      case "tool_call_complete": {
        const tc = rc.streamingState.toolCalls.find((t) => t.id === event.id);
        if (tc) {
          tc.status = "completed";
          tc.result = event.result;
          tc.attachments = event.attachments;
        }
        break;
      }
      case "new_message":
        // 新一轮 LLM 调用，重置流式状态
        rc.streamingState = { content: "", thinking: "", toolCalls: [] };
        break;
      case "ask_user":
        rc.pendingAskUser = {
          id: event.id,
          question: event.question,
          options: event.options,
          multiple: event.multiple,
        };
        break;
      case "task_update":
        rc.tasks = event.tasks;
        break;
      case "done":
        rc.status = "done";
        rc.pendingAskUser = undefined;
        break;
      case "error":
        rc.status = "error";
        rc.pendingAskUser = undefined;
        break;
    }
  }

  // 广播事件到所有 listener
  broadcastEvent(rc: RunningConversation, event: ChatStreamEvent) {
    for (const listener of rc.listeners) {
      try {
        listener.sendEvent(event);
      } catch {
        // listener 断开，忽略
      }
    }
  }

  // 附加 UI 连接到后台运行中的会话（同步快照 + listener + askUser resolver + stop）
  async handleAttach(params: { conversationId: string }, sender: IGetSender): Promise<void> {
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("attachToConversation requires connect mode");
    }
    const msgConn = sender.getConnect()!;

    const rc = this.runningConversations.get(params.conversationId);

    const sendEvent = (event: ChatStreamEvent) => {
      msgConn.sendMessage({ action: "event", data: event });
    };

    if (!rc) {
      // 会话不在运行中
      sendEvent({ type: "sync", tasks: [], status: "done" });
      return;
    }

    // 发送 sync 快照
    const syncEvent: ChatStreamEvent = {
      type: "sync",
      streamingMessage:
        rc.streamingState.content || rc.streamingState.thinking || rc.streamingState.toolCalls.length > 0
          ? {
              content: rc.streamingState.content,
              thinking: rc.streamingState.thinking || undefined,
              toolCalls: rc.streamingState.toolCalls,
            }
          : undefined,
      pendingAskUser: rc.pendingAskUser,
      tasks: rc.tasks,
      status: rc.status,
    };
    sendEvent(syncEvent);

    // 已完成则不需要添加 listener
    if (rc.status !== "running") {
      return;
    }

    // 添加 listener
    const listener: ListenerEntry = { sendEvent };
    rc.listeners.add(listener);

    // 处理来自 UI 的消息
    msgConn.onMessage((msg: any) => {
      if (msg.action === "askUserResponse" && msg.data) {
        const resolver = rc.askResolvers.get(msg.data.id);
        if (resolver) {
          rc.askResolvers.delete(msg.data.id);
          rc.pendingAskUser = undefined;
          resolver(msg.data.answer);
        }
      }
      if (msg.action === "stop") {
        rc.abortController.abort();
      }
    });

    msgConn.onDisconnect(() => {
      rc.listeners.delete(listener);
    });
  }

  // 延迟清理后台运行会话注册表（给迟到的重连者 30s 窗口）
  cleanupIfDone(conversationId: string) {
    const rc = this.runningConversations.get(conversationId);
    if (!rc) return;
    setTimeout(() => {
      // 重新检查：如果会话已被复用（新的 rc 实例）或正在运行，则不删除
      const current = this.runningConversations.get(conversationId);
      if (current === rc && current.status !== "running") {
        this.runningConversations.delete(conversationId);
      }
    }, 30_000);
  }
}
