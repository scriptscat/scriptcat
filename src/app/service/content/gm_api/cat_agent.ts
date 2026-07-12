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
        conn.sendMessage({
          action: "toolResults",
          requestId: message.requestId,
          data: await executeTools.call(this, message.data, handlers),
        });
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
          resolve({
            content: finishRound(false),
            thinking: thinking || undefined,
            toolCalls: aggregate.length ? aggregate : undefined,
            usage,
            durationMs,
          });
          break;
        case "error":
          reject(Object.assign(new Error(event.message), event));
          break;
      }
    });
    conn.onDisconnect(() => reject(new Error("Connection disconnected")));
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
      conn.sendMessage({
        action: "toolResults",
        requestId: message.requestId,
        data: await executeTools.call(this, message.data, handlers),
      });
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
        break;
    }
  });
  conn.onDisconnect(() => {
    if (done) return;
    done = true;
    error = new Error("Connection disconnected");
    wake?.();
  });

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
      this.messageHistory.push({
        role: "assistant",
        content: buildContent(text, blocks),
        toolCalls: toolCalls.length ? toolCalls.map(cloneToolCall) : undefined,
      });
      for (const toolCall of toolCalls) {
        if (toolCall.result !== undefined) {
          this.messageHistory.push({
            role: "tool",
            content: toolCall.result,
            toolCallId: toolCall.id,
          });
        }
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
