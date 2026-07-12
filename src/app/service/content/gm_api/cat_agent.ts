import BaseApi, { ConversationInstance as BaseConversationInstance } from "./cat_agent_base";
import type { MessageConnect } from "@Packages/message/types";
import type {
  ChatReply,
  ChatStreamEvent,
  ContentBlock,
  MessageContent,
  StreamChunk as BaseStreamChunk,
  ToolCall,
  ToolDefinition,
} from "@App/app/service/agent/core/types";

export type ConversationStreamChunk =
  | BaseStreamChunk
  | {
      type: "sync";
      streamingMessage?: {
        content: string;
        thinking?: string;
        toolCalls: ToolCall[];
      };
      pendingAskUser?: {
        id: string;
        question: string;
        options?: string[];
        optionValues?: string[];
        multiple?: boolean;
        allowCustom?: boolean;
      };
      tasks: Array<{
        id: string;
        subject: string;
        status: "pending" | "in_progress" | "completed";
        description?: string;
      }>;
      status: "running" | "done" | "error";
    };

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
type Instance = BaseConversationInstance & Record<string, any>;

function cloneToolCall(toolCall: ToolCall): ToolCall {
  return {
    ...toolCall,
    attachments: toolCall.attachments ? [...toolCall.attachments] : undefined,
  };
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  const serialized = JSON.stringify(result);
  return serialized === undefined ? "null" : serialized;
}

function buildContent(text: string, blocks: ContentBlock[]): MessageContent {
  if (blocks.length === 0) return text;
  return [...(text ? [{ type: "text" as const, text }] : []), ...blocks];
}

function resolveToolCall(
  ordered: ToolCall[],
  byId: Map<string, ToolCall>,
  id: string,
  index?: number
): ToolCall | undefined {
  if (id && byId.has(id)) return byId.get(id);
  if (index !== undefined && ordered[index]) return ordered[index];
  for (let i = ordered.length - 1; i >= 0; i--) {
    if ((ordered[i].status ?? "running") === "running") return ordered[i];
  }
  return undefined;
}

async function executeTools(
  this: Instance,
  toolCalls: ToolCall[],
  handlers: Map<string, ToolHandler>
): Promise<Array<{ id: string; result: string; error?: boolean }>> {
  const results: Array<{ id: string; result: string; error?: boolean }> = [];
  for (const toolCall of toolCalls) {
    const handler = handlers.get(toolCall.name);
    if (!handler) {
      results.push({
        id: toolCall.id,
        result: JSON.stringify({ error: `Tool "${toolCall.name}" not found` }),
        error: true,
      });
      continue;
    }
    try {
      const args = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
      results.push({
        id: toolCall.id,
        result: stringifyToolResult(await handler(args)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message || error.toString() : String(error);
      results.push({
        id: toolCall.id,
        result: JSON.stringify({ error: message }),
        error: true,
      });
    }
  }
  return results;
}

function mergeTools(this: Instance, callTools?: Array<any>) {
  const toolDefs: ToolDefinition[] = [...this.toolDefs];
  const handlers = new Map<string, ToolHandler>(this.toolHandlers);
  for (const tool of callTools || []) {
    const definition = {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    };
    const index = toolDefs.findIndex((item) => item.name === tool.name);
    if (index >= 0) toolDefs[index] = definition;
    else toolDefs.push(definition);
    handlers.set(tool.name, tool.handler);
  }
  return { toolDefs, handlers };
}

function processChat(this: Instance, conn: MessageConnect, handlers: Map<string, ToolHandler>): Promise<ChatReply> {
  return new Promise((resolve, reject) => {
    // 部分实现的 disconnect() 会同步触发 onDisconnect，若在 resolve/reject 之前调用会被
    // "Connection disconnected" 抢先 reject；用 settled 标记确保只有第一次终态判定生效。
    let settled = false;
    let content = "";
    let thinking = "";
    let blocks: ContentBlock[] = [];
    let ordered: ToolCall[] = [];
    let byId = new Map<string, ToolCall>();
    const aggregate: ToolCall[] = [];
    let usage: ChatReply["usage"];
    let durationMs: number | undefined;

    const finishRound = (record = true): MessageContent => {
      const finalContent = buildContent(content, blocks);
      const round = ordered.map(cloneToolCall);
      aggregate.push(...round);
      if (this.ephemeral && record && (content || blocks.length || round.length)) {
        this.messageHistory.push({
          role: "assistant",
          content: finalContent,
          toolCalls: round.length ? round : undefined,
        });
        for (const toolCall of round) {
          if (toolCall.result !== undefined) {
            this.messageHistory.push({
              role: "tool",
              content: toolCall.result,
              toolCallId: toolCall.id,
            });
          }
        }
      }
      content = "";
      blocks = [];
      ordered = [];
      byId = new Map();
      return finalContent;
    };

    conn.onMessage(async (message: any) => {
      if (message.action === "executeTools") {
        const data = await executeTools.call(this, message.data, handlers);
        // 工具函数执行期间连接可能已经因 Stop/脚本工具超时而 settle 并断开；
        // 断开后的连接 sendMessage 会抛错，且这里是异步回调，事件源不会 await/捕获它，
        // 会在用户脚本上下文里变成 unhandled rejection（见 finding 7）
        if (settled) return;
        try {
          conn.sendMessage({
            action: "toolResults",
            requestId: message.requestId,
            data,
          });
        } catch {
          // 连接已断开，结果无处可送，安全忽略
        }
        return;
      }
      if (message.action !== "event") return;
      const event: ChatStreamEvent = message.data;
      if ("subAgent" in event && event.subAgent) return;
      switch (event.type) {
        case "content_delta":
          content += event.delta;
          break;
        case "thinking_delta":
          thinking += event.delta;
          break;
        case "content_block_complete":
          blocks.push(event.block);
          break;
        case "tool_call_start": {
          const toolCall: ToolCall = {
            ...event.toolCall,
            arguments: event.toolCall.arguments || "",
            status: "running",
          };
          ordered.push(toolCall);
          byId.set(toolCall.id, toolCall);
          break;
        }
        case "tool_call_delta": {
          const toolCall = resolveToolCall(ordered, byId, event.id, event.index);
          if (toolCall) toolCall.arguments += event.delta;
          break;
        }
        case "tool_call_complete": {
          const toolCall = resolveToolCall(ordered, byId, event.id);
          if (toolCall) {
            toolCall.result = event.result;
            toolCall.status = event.status ?? "completed";
            toolCall.attachments = event.attachments ? [...event.attachments] : undefined;
          }
          break;
        }
        case "new_message":
          finishRound();
          break;
        case "done":
          usage = event.usage;
          durationMs = event.durationMs;
          settled = true;
          resolve({
            content: finishRound(false),
            thinking: thinking || undefined,
            toolCalls: aggregate.length ? aggregate : undefined,
            usage,
            durationMs,
          });
          conn.disconnect();
          break;
        case "error":
          settled = true;
          reject(Object.assign(new Error(event.message), event));
          conn.disconnect();
          break;
      }
    });
    conn.onDisconnect(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Connection disconnected"));
    });
  });
}

function processStream(
  this: Instance,
  conn: MessageConnect,
  handlers: Map<string, ToolHandler>
): AsyncIterable<ConversationStreamChunk> {
  const chunks: ConversationStreamChunk[] = [];
  let wake: (() => void) | undefined;
  let done = false;
  let error: Error | undefined;
  let surfaced = false;
  let ordered: ToolCall[] = [];
  let byId = new Map<string, ToolCall>();

  const reset = (toolCalls: ToolCall[] = []) => {
    ordered = toolCalls.map((toolCall) => ({
      ...cloneToolCall(toolCall),
      status: toolCall.status ?? "running",
    }));
    byId = new Map(ordered.map((toolCall) => [toolCall.id, toolCall]));
  };
  const push = (chunk: ConversationStreamChunk) => {
    chunks.push(chunk);
    wake?.();
  };

  conn.onMessage(async (message: any) => {
    if (message.action === "executeTools") {
      const data = await executeTools.call(this, message.data, handlers);
      // 工具函数执行期间连接可能已经因 Stop/脚本工具超时而结束并断开；
      // 断开后的连接 sendMessage 会抛错，且这里是异步回调，事件源不会 await/捕获它，
      // 会在用户脚本上下文里变成 unhandled rejection（见 finding 7）
      if (done) return;
      try {
        conn.sendMessage({
          action: "toolResults",
          requestId: message.requestId,
          data,
        });
      } catch {
        // 连接已断开，结果无处可送，安全忽略
      }
      return;
    }
    if (message.action !== "event") return;
    const event: ChatStreamEvent = message.data;
    if ("subAgent" in event && event.subAgent) return;
    switch (event.type) {
      case "sync":
        reset(event.streamingMessage?.toolCalls || []);
        push({
          type: "sync",
          streamingMessage: event.streamingMessage
            ? {
                ...event.streamingMessage,
                toolCalls: ordered.map(cloneToolCall),
              }
            : undefined,
          pendingAskUser: event.pendingAskUser ? { ...event.pendingAskUser } : undefined,
          tasks: event.tasks.map((task) => ({ ...task })),
          status: event.status,
        });
        done = event.status !== "running";
        // 终态快照：attach 的会话已经结束，SW 侧不会再为这条连接注册 listener，
        // 也就不会再有后续事件——必须在这里主动断开，否则 port 会一直挂着
        if (done) conn.disconnect();
        break;
      case "content_delta":
        push({ type: "content_delta", content: event.delta });
        break;
      case "thinking_delta":
        push({ type: "thinking_delta", content: event.delta });
        break;
      case "content_block_complete":
        push({ type: "content_block", block: event.block });
        break;
      case "tool_call_start": {
        const toolCall: ToolCall = {
          ...event.toolCall,
          arguments: event.toolCall.arguments || "",
          status: "running",
        };
        ordered.push(toolCall);
        byId.set(toolCall.id, toolCall);
        push({ type: "tool_call", toolCall: cloneToolCall(toolCall) });
        break;
      }
      case "tool_call_delta": {
        const toolCall = resolveToolCall(ordered, byId, event.id, event.index);
        if (toolCall) {
          toolCall.arguments += event.delta;
          push({ type: "tool_call", toolCall: cloneToolCall(toolCall) });
        }
        break;
      }
      case "tool_call_complete": {
        const toolCall = resolveToolCall(ordered, byId, event.id);
        if (toolCall) {
          toolCall.result = event.result;
          toolCall.status = event.status ?? "completed";
          toolCall.attachments = event.attachments ? [...event.attachments] : undefined;
        }
        push({
          type: "tool_call_complete",
          toolCall:
            toolCall ||
            ({
              id: event.id,
              name: "",
              arguments: "",
              result: event.result,
              status: event.status ?? "completed",
              attachments: event.attachments ? [...event.attachments] : undefined,
            } as ToolCall),
        });
        break;
      }
      case "new_message":
        push({ type: "new_message" });
        reset();
        break;
      case "done":
        push({
          type: "done",
          usage: event.usage,
          durationMs: event.durationMs,
        });
        done = true;
        conn.disconnect();
        break;
      case "error":
        push({
          type: "error",
          error: event.message,
          errorCode: event.errorCode,
          usage: event.usage,
          durationMs: event.durationMs,
        });
        error = Object.assign(new Error(event.message), event);
        done = true;
        conn.disconnect();
        break;
    }
  });
  conn.onDisconnect(() => {
    if (done) return;
    done = true;
    error = new Error("Connection disconnected");
    wake?.();
  });

  // 提前退出（for await...break、消费方 throw）时必须断开连接并唤醒挂起的 next()，
  // 否则 port/listener 会一直挂在 SW 侧，直到脚本上下文销毁
  const closeEarly = () => {
    if (done) return;
    done = true;
    try {
      conn.disconnect();
    } catch {
      // port 可能已断开
    }
    wake?.();
  };

  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<ConversationStreamChunk>> {
          while (!chunks.length && !done) await new Promise<void>((resolve) => (wake = resolve));
          if (chunks.length) {
            const chunk = chunks.shift()!;
            if (chunk.type === "error") surfaced = true;
            return { value: chunk, done: false };
          }
          if (error && !surfaced) {
            surfaced = true;
            throw error;
          }
          return { value: undefined as never, done: true };
        },
        async return(value?: unknown): Promise<IteratorResult<ConversationStreamChunk>> {
          closeEarly();
          return { value: value as never, done: true };
        },
        async throw(err?: unknown): Promise<IteratorResult<ConversationStreamChunk>> {
          closeEarly();
          throw err;
        },
      };
    },
  };
}

function processStreamEphemeral(
  this: Instance,
  conn: MessageConnect,
  handlers: Map<string, ToolHandler>
): AsyncIterable<ConversationStreamChunk> {
  const inner = processStream.call(this, conn, handlers);
  let text = "";
  let blocks: ContentBlock[] = [];
  let toolCalls: ToolCall[] = [];
  const finish = () => {
    if (text || blocks.length || toolCalls.length) {
      // 提前退出（for await...break / 消费方抛错）时，可能有 toolCall 还停在 tool_call_start/
      // delta 阶段就被 return()/throw() 打断，从未收到 tool_call_complete。这类 toolCall 没有
      // result，如果原样把它们的 assistant 消息记入历史重放给 provider，大多数 provider 会
      // 因为"assistant 消息里的 tool_call 缺少对应的 tool 结果消息"而报错（见 finding 9）。
      // 统一在这里把没有 result 的 toolCall 补成终态 cancelled，并补上配对的 tool 结果消息，
      // 保证重放给 provider 的历史里 tool_call/tool_result 协议状态始终完整。
      const finalized = toolCalls.map((toolCall) => {
        if (toolCall.result !== undefined) return cloneToolCall(toolCall);
        return cloneToolCall({
          ...toolCall,
          status: "error",
          result: JSON.stringify({ error: "Tool call cancelled: stream ended before it completed" }),
        });
      });
      this.messageHistory.push({
        role: "assistant",
        content: buildContent(text, blocks),
        toolCalls: finalized.length ? finalized : undefined,
      });
      for (const toolCall of finalized) {
        this.messageHistory.push({
          role: "tool",
          content: toolCall.result!,
          toolCallId: toolCall.id,
        });
      }
    }
    text = "";
    blocks = [];
    toolCalls = [];
  };
  return {
    [Symbol.asyncIterator]() {
      const iterator = inner[Symbol.asyncIterator]();
      return {
        async next() {
          const result = await iterator.next();
          if (result.done) {
            finish();
            return result;
          }
          const chunk = result.value;
          if (chunk.type === "content_delta") text += chunk.content || "";
          else if (chunk.type === "content_block" && chunk.block) blocks.push(chunk.block);
          else if ((chunk.type === "tool_call" || chunk.type === "tool_call_complete") && chunk.toolCall) {
            const index = toolCalls.findIndex((toolCall) => toolCall.id === chunk.toolCall!.id);
            if (index >= 0) toolCalls[index] = cloneToolCall(chunk.toolCall);
            else toolCalls.push(cloneToolCall(chunk.toolCall));
          } else if (chunk.type === "new_message") finish();
          return result;
        },
        // 转发 return()/throw() 给内层 processStream 的迭代器，否则 for await...break
        // 或消费方抛错时内层不会 disconnect，port 会一直挂着（见 finding 6）。
        // 提前退出时也提交已累积的部分输出到 messageHistory，与正常完成时的行为一致，
        // 避免下一轮 chat() 因为丢失这部分历史而导致上下文断裂。
        async return(value?: unknown) {
          finish();
          await iterator.return?.(value);
          return { value: value as never, done: true };
        },
        async throw(err?: unknown) {
          finish();
          await iterator.throw?.(err);
          throw err;
        },
      };
    },
  };
}

const prototype = BaseConversationInstance.prototype as unknown as Record<string, unknown>;
prototype.mergeTools = mergeTools;
prototype.executeTools = executeTools;
prototype.processChat = processChat;
prototype.processStream = processStream;
prototype.processStreamEphemeral = processStreamEphemeral;

export const ConversationInstance = BaseConversationInstance;
export default BaseApi;
