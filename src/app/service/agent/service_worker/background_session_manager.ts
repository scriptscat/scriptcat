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
  pendingAskUser?: {
    id: string;
    question: string;
    options?: string[];
    optionValues?: string[];
    multiple?: boolean;
    allowCustom?: boolean;
  };
  askResolvers: Map<string, (answer: string) => void>;
  tasks: Array<{ id: string; subject: string; status: "pending" | "in_progress" | "completed"; description?: string }>;
  // cancelling：stop() 已触发但执行方尚未真正退出（promise 未 settle）；
  // 在此期间该 conversationId 仍视为"占用中"，避免同 ID 的替换会话被过早放行。
  status: "running" | "cancelling" | "done" | "error";
};

// 后台会话注册表：管理流式状态快照、listener 广播、UI 附加逻辑
export class BackgroundSessionManager {
  private runningConversations = new Map<string, RunningConversation>();

  has(conversationId: string): boolean {
    const status = this.runningConversations.get(conversationId)?.status;
    return status === "running" || status === "cancelling";
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
    return Array.from(this.runningConversations.entries())
      .filter(([, conversation]) => conversation.status === "running")
      .map(([conversationId]) => conversationId);
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
      case "tool_call_delta": {
        // 按 id 匹配（fallback 到最新 running 的 tc），不再盲目取 length-1。
        // 并发 tool call 时（OpenAI 用 index 区分、Anthropic 的多个 tool_use block）length-1 会把 delta 写错工具。
        if (rc.streamingState.toolCalls.length === 0) break;

        let target: ToolCall | undefined = undefined;
        // 1a. 按 id 匹配
        if (event.id) {
          target = rc.streamingState.toolCalls.find((t) => t.id === event.id);
        }
        // 1b. 按 index 匹配（OpenAI 后续 chunk 无 id 只有 index）
        if (!target && event.index !== undefined) {
          target = rc.streamingState.toolCalls[event.index];
        }

        // 2. fallback：最新一个状态为 running 的 tool call
        //    （OpenAI 后续 chunk 不带 id，但同一 index 的 tool 一定在 running）
        if (!target) {
          for (let i = rc.streamingState.toolCalls.length - 1; i >= 0; i--) {
            if (rc.streamingState.toolCalls[i].status === "running") {
              target = rc.streamingState.toolCalls[i];
              break;
            }
          }
        }

        if (target) target.arguments += event.delta;
        break;
      }
      case "tool_call_complete": {
        const tc = rc.streamingState.toolCalls.find((t) => t.id === event.id);
        if (tc) {
          tc.status = event.status || "completed";
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
          optionValues: event.optionValues,
          multiple: event.multiple,
          allowCustom: event.allowCustom,
        };
        break;
      case "ask_user_expired":
        if (rc.pendingAskUser?.id === event.id) rc.pendingAskUser = undefined;
        break;
      case "ask_user_resolved":
        if (rc.pendingAskUser?.id === event.id) rc.pendingAskUser = undefined;
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

  // 停止后台会话：仅置为 cancelling（占用态，阻止同 ID 会话被过早顶替），
  // 真正的终态（done/error）由持有该 rc 实例的执行方在 promise 落定后写入，见 finalizeCancelled()。
  // expectedRc 用于校验调用方持有的会话实例仍是当前会话，防止旧连接的延迟 Stop 误伤已顶替上位的新会话。
  stop(conversationId: string, expectedRc?: RunningConversation): void {
    const rc = this.runningConversations.get(conversationId);
    if (!rc || (expectedRc && rc !== expectedRc)) return;
    if (rc.status !== "running") return;

    rc.status = "cancelling";
    rc.pendingAskUser = undefined;
    rc.askResolvers.clear();
    rc.abortController.abort();

    const event: ChatStreamEvent = { type: "error", message: "Conversation cancelled", errorCode: "cancelled" };
    this.broadcastEvent(rc, event);
  }

  // 执行方在 abort 落定、promise 真正 settle 后调用，把 cancelling 收敛为终态。
  // 通过实例比对避免误将已被新会话顶替的 map 条目错误终态化。
  finalizeCancelled(conversationId: string, rc: RunningConversation): void {
    if (this.runningConversations.get(conversationId) !== rc) return;
    if (rc.status !== "cancelling") return;
    rc.status = "error";
    this.cleanupIfDone(conversationId);
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
      // cancelling 对外等同于终态：晚到的重连者不会再收到任何后续广播（见 stop/finalizeCancelled），
      // 应立即按已结束处理，而不是误报为 running 导致 UI 一直转圈等待
      status: rc.status === "cancelling" ? "error" : rc.status,
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
          // resolver 自身（ask_user.ts / askUserForGuard）负责广播其终态事件，
          // 这里不再重复广播，否则同一次回答会产生两条 ask_user_resolved
          resolver(msg.data.answer);
        }
      }
      if (msg.action === "stop") {
        this.stop(params.conversationId, rc);
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
