import GMContext from "./gm_context";
import { uuidv4 } from "@App/pkg/utils/uuid";
import type { MessageConnect } from "@Packages/message/types";
import type {
  ChatReply,
  ChatStreamEvent,
  CommandHandler,
  ContentBlock,
  Conversation,
  ConversationApiRequest,
  ConversationCreateOptions,
  ChatOptions,
  StreamChunk,
  ToolCall,
  ToolDefinition,
  ChatMessage,
  MessageRole,
  MessageContent,
} from "@App/app/service/agent/core/types";
import { getTextContent } from "@App/app/service/agent/core/content_utils";

export type ConversationStreamChunk =
  | StreamChunk
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

type ToolHandler = (args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;

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

// 对话实例，暴露给用户脚本
// 导出供测试使用
export class ConversationInstance {
  public toolHandlers: Map<string, ToolHandler> = new Map();
  public toolDefs: ToolDefinition[] = [];
  private commandHandlers: Map<string, CommandHandler> = new Map();
  public ephemeral: boolean;
  private cache?: boolean;
  private systemPrompt?: string;
  public messageHistory: Array<{
    role: MessageRole;
    content: MessageContent;
    toolCallId?: string;
    toolCalls?: ToolCall[];
  }> = [];

  private background: boolean;

  constructor(
    private conv: Conversation,
    private gmSendMessage: (api: string, params: any[]) => Promise<any>,
    private gmConnect: (api: string, params: any[]) => Promise<MessageConnect>,
    private scriptUuid: string,
    private maxIterations: number,
    initialTools?: ConversationCreateOptions["tools"],
    commands?: Record<string, CommandHandler>,
    ephemeral?: boolean,
    system?: string,
    cache?: boolean,
    background?: boolean
  ) {
    this.ephemeral = ephemeral || false;
    this.background = background || false;
    this.cache = cache;
    this.systemPrompt = system;
    if (initialTools) {
      for (const tool of initialTools) {
        this.toolHandlers.set(tool.name, tool.handler);
        this.toolDefs.push({ name: tool.name, description: tool.description, parameters: tool.parameters });
      }
    }

    // 注册内置 /new 命令
    this.commandHandlers.set("/new", async () => {
      await this.clear();
      return "对话已清空";
    });

    // 用户传入的 commands 覆盖内置命令
    if (commands) {
      for (const [name, handler] of Object.entries(commands)) {
        this.commandHandlers.set(name, handler);
      }
    }
  }

  get id() {
    return this.conv.id;
  }

  get title() {
    return this.conv.title;
  }

  get modelId() {
    return this.conv.modelId;
  }

  // 发送消息并获取回复（内置 tool calling 循环）
  async chat(content: MessageContent, options?: ChatOptions): Promise<ChatReply> {
    // 命令拦截（仅纯文本消息支持命令）
    const textContent = getTextContent(content);
    const cmdResult = await this.tryExecuteCommand(textContent);
    if (cmdResult !== undefined) return cmdResult;

    const { toolDefs, handlers } = this.mergeTools(options?.tools);

    // ephemeral 模式：追加 user message 到内存历史
    if (this.ephemeral) {
      this.messageHistory.push({ role: "user", content });
    }

    // 通过 GM API connect 建立流式连接
    const connectParams: Record<string, unknown> = {
      conversationId: this.conv.id,
      generation: this.conv.generation,
      message: content,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      maxIterations: this.maxIterations,
      scriptUuid: this.scriptUuid,
    };

    if (this.cache !== undefined) {
      connectParams.cache = this.cache;
    }
    if (this.background) {
      connectParams.background = true;
    }
    if (this.ephemeral) {
      connectParams.ephemeral = true;
      connectParams.messages = this.messageHistory;
      connectParams.system = this.systemPrompt;
      connectParams.modelId = this.conv.modelId;
    }

    const conn = await this.gmConnect("CAT_agentConversationChat", [connectParams]);

    const reply = await this.processChat(conn, handlers);

    // ephemeral 模式：中间轮次（带 tool calls）已在 processChat 内按 new_message 边界追加到内存历史，
    // 这里只需追加不含 tool calls 的最终回复（done 事件保证到达时已无待处理的 tool calls）。
    if (this.ephemeral) {
      this.messageHistory.push({ role: "assistant", content: reply.content });
    }

    return reply;
  }

  // 流式发送消息
  async chatStream(content: MessageContent, options?: ChatOptions): Promise<AsyncIterable<StreamChunk>> {
    // 命令拦截：返回单个 done chunk（仅纯文本消息支持命令）
    const textContent = getTextContent(content);
    const cmdResult = await this.tryExecuteCommand(textContent);
    if (cmdResult !== undefined) {
      return {
        [Symbol.asyncIterator]() {
          let yielded = false;
          return {
            async next(): Promise<IteratorResult<StreamChunk>> {
              if (!yielded) {
                yielded = true;
                return {
                  value: { type: "done" as const, content: getTextContent(cmdResult.content), command: true },
                  done: false,
                };
              }
              return { value: undefined as any, done: true };
            },
          };
        },
      };
    }

    const { toolDefs, handlers } = this.mergeTools(options?.tools);

    // ephemeral 模式：追加 user message 到内存历史
    if (this.ephemeral) {
      this.messageHistory.push({ role: "user", content });
    }

    const connectParams: Record<string, unknown> = {
      conversationId: this.conv.id,
      generation: this.conv.generation,
      message: content,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      maxIterations: this.maxIterations,
      scriptUuid: this.scriptUuid,
    };

    if (this.cache !== undefined) {
      connectParams.cache = this.cache;
    }
    if (this.background) {
      connectParams.background = true;
    }
    if (this.ephemeral) {
      connectParams.ephemeral = true;
      connectParams.messages = this.messageHistory;
      connectParams.system = this.systemPrompt;
      connectParams.modelId = this.conv.modelId;
    }

    const conn = await this.gmConnect("CAT_agentConversationChat", [connectParams]);

    // chat 连接不会收到 sync 事件（sync 快照仅由 attach 的 SW 端发出），
    // 公开签名与 scriptcat.d.ts 保持一致：chatStream 只产出 StreamChunk
    // ephemeral 模式：包装 stream 以收集 assistant 消息到内存历史
    if (this.ephemeral) {
      return this.processStreamEphemeral(conn, handlers) as AsyncIterable<StreamChunk>;
    }

    return this.processStream(conn, handlers) as AsyncIterable<StreamChunk>;
  }

  // 解析命令："/command args" -> { name, args }
  private parseCommand(content: string): { name: string; args: string } | null {
    const trimmed = content.trim();
    if (!trimmed.startsWith("/")) return null;
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) return { name: trimmed, args: "" };
    return { name: trimmed.slice(0, spaceIdx), args: trimmed.slice(spaceIdx + 1).trim() };
  }

  // 尝试执行命令，未注册的命令返回 undefined（正常发送给 LLM）
  private async tryExecuteCommand(content: string): Promise<ChatReply | undefined> {
    const parsed = this.parseCommand(content);
    if (!parsed) return undefined;

    const handler = this.commandHandlers.get(parsed.name);
    if (!handler) return undefined;

    const result = await handler(parsed.args, this);
    // 命令结果始终为纯文本 string
    return { content: (result || "") as string, command: true };
  }

  // 合并实例级别和调用级别的工具定义（调用级同名工具同时替换 schema 与 handler）
  protected mergeTools(callTools?: ChatOptions["tools"]) {
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

  // 获取对话历史
  async getMessages(): Promise<ChatMessage[]> {
    if (this.ephemeral) {
      // ephemeral 模式：从内存历史转换为 ChatMessage 格式
      return this.messageHistory.map((msg, idx) => ({
        id: `ephemeral-${idx}`,
        conversationId: this.conv.id,
        role: msg.role,
        content: msg.content,
        toolCallId: msg.toolCallId,
        toolCalls: msg.toolCalls,
        createtime: Date.now(),
      }));
    }
    const messages = await this.gmSendMessage("CAT_agentConversation", [
      {
        action: "getMessages",
        conversationId: this.conv.id,
        generation: this.conv.generation,
        scriptUuid: this.scriptUuid,
      } as ConversationApiRequest,
    ]);
    return messages || [];
  }

  // 清空对话消息历史
  async clear(): Promise<void> {
    if (this.ephemeral) {
      this.messageHistory = [];
      return;
    }
    await this.gmSendMessage("CAT_agentConversation", [
      {
        action: "clearMessages",
        conversationId: this.conv.id,
        generation: this.conv.generation,
        scriptUuid: this.scriptUuid,
      } as ConversationApiRequest,
    ]);
  }

  // 持久化对话
  async save(): Promise<void> {
    await this.gmSendMessage("CAT_agentConversation", [
      {
        action: "save",
        conversationId: this.conv.id,
        generation: this.conv.generation,
        scriptUuid: this.scriptUuid,
      } as ConversationApiRequest,
    ]);
  }

  // 附加到后台运行中的会话，返回流式事件（首个 chunk 为 sync 快照）
  async attach(): Promise<AsyncIterable<ConversationStreamChunk>> {
    const conn = await this.gmConnect("CAT_agentAttachToConversation", [
      { conversationId: this.conv.id, generation: this.conv.generation, scriptUuid: this.scriptUuid },
    ]);
    return this.processStream(conn, new Map());
  }

  // 处理非流式 chat 的响应
  protected processChat(conn: MessageConnect, handlers: Map<string, ToolHandler>): Promise<ChatReply> {
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

      // SW 端脚本工具批次超时后发来的作废通知（按 requestId 关联）：
      // 该批次剩余 handler 不再执行，避免其副作用与下一批次交叠（见 finding 6）
      const cancelledBatches = new Set<string>();
      const batchControllers = new Map<string, AbortController>();
      const abortBatches = () => {
        for (const controller of batchControllers.values()) controller.abort();
        batchControllers.clear();
      };

      conn.onMessage(async (message: any) => {
        if (message.action === "cancelToolBatch") {
          if (message.requestId) {
            cancelledBatches.add(message.requestId);
            batchControllers.get(message.requestId)?.abort();
          }
          return;
        }
        if (message.action === "executeTools") {
          const batchId: string | undefined = message.requestId;
          const controller = new AbortController();
          if (batchId) batchControllers.set(batchId, controller);
          const data = await this.executeTools(
            message.data,
            handlers,
            () => {
              return settled || (batchId !== undefined && cancelledBatches.has(batchId));
            },
            controller.signal
          );
          if (batchId) batchControllers.delete(batchId);
          // 工具函数执行期间连接可能已经因 Stop/脚本工具超时而 settle 并断开；
          // 断开后的连接 sendMessage 会抛错，且这里是异步回调，事件源不会 await/捕获它，
          // 会在用户脚本上下文里变成 unhandled rejection（见 finding 7）
          if (settled || (batchId !== undefined && cancelledBatches.has(batchId))) return;
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
            abortBatches();
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
            abortBatches();
            reject(Object.assign(new Error(event.message), event));
            conn.disconnect();
            break;
        }
      });
      conn.onDisconnect(() => {
        if (settled) return;
        settled = true;
        abortBatches();
        reject(new Error("Connection disconnected"));
      });
    });
  }

  // 处理流式 chat 的响应
  protected processStream(
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

    // SW 端脚本工具批次超时后发来的作废通知（按 requestId 关联）：
    // 该批次剩余 handler 不再执行，避免其副作用与下一批次交叠（见 finding 6）
    const cancelledBatches = new Set<string>();
    const batchControllers = new Map<string, AbortController>();
    const abortBatches = () => {
      for (const controller of batchControllers.values()) controller.abort();
      batchControllers.clear();
    };

    conn.onMessage(async (message: any) => {
      if (message.action === "cancelToolBatch") {
        if (message.requestId) {
          cancelledBatches.add(message.requestId);
          batchControllers.get(message.requestId)?.abort();
        }
        return;
      }
      if (message.action === "executeTools") {
        const batchId: string | undefined = message.requestId;
        const controller = new AbortController();
        if (batchId) batchControllers.set(batchId, controller);
        const data = await this.executeTools(
          message.data,
          handlers,
          () => {
            return done || (batchId !== undefined && cancelledBatches.has(batchId));
          },
          controller.signal
        );
        if (batchId) batchControllers.delete(batchId);
        // 工具函数执行期间连接可能已经因 Stop/脚本工具超时而结束并断开；
        // 断开后的连接 sendMessage 会抛错，且这里是异步回调，事件源不会 await/捕获它，
        // 会在用户脚本上下文里变成 unhandled rejection（见 finding 7）
        if (done || (batchId !== undefined && cancelledBatches.has(batchId))) return;
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
          abortBatches();
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
          abortBatches();
          conn.disconnect();
          break;
      }
    });
    conn.onDisconnect(() => {
      if (done) return;
      done = true;
      abortBatches();
      error = new Error("Connection disconnected");
      wake?.();
    });

    // 提前退出（for await...break、消费方 throw）时必须断开连接并唤醒挂起的 next()，
    // 否则 port/listener 会一直挂在 SW 侧，直到脚本上下文销毁
    const closeEarly = () => {
      if (done) return;
      done = true;
      abortBatches();
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

  // 处理 ephemeral 流式 chat 的响应（收集 assistant 消息到内存历史）
  protected processStreamEphemeral(
    conn: MessageConnect,
    handlers: Map<string, ToolHandler>
  ): AsyncIterable<ConversationStreamChunk> {
    const inner = this.processStream(conn, handlers);
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

  // 执行用户定义的 tool handlers。
  // isSettled：连接/请求批次是否已经 settle（Stop、脚本工具超时、连接断开）。串行执行期间在每个
  // handler 之前检查，而不是只在整批结束后检查一次——否则已经 settle 之后，剩余的
  // handler 仍会继续跑，其副作用可能和后续新批次的 handler 重叠（见 finding 9）
  protected async executeTools(
    toolCalls: ToolCall[],
    handlers: Map<string, ToolHandler>,
    isSettled?: () => boolean,
    signal: AbortSignal = new AbortController().signal
  ): Promise<Array<{ id: string; result: string; error?: boolean }>> {
    const results: Array<{ id: string; result: string; error?: boolean }> = [];
    for (const toolCall of toolCalls) {
      if (signal.aborted || isSettled?.()) {
        results.push({
          id: toolCall.id,
          result: JSON.stringify({ error: "Tool execution cancelled: connection already settled" }),
          error: true,
        });
        continue;
      }
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
          result: stringifyToolResult(await handler(args, signal)),
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
}

// 运行时 this 是 GM_Base 实例，定义其实际拥有的字段类型
interface GMBaseContext {
  sendMessage: (api: string, params: unknown[]) => Promise<unknown>;
  connect: (api: string, params: unknown[]) => Promise<MessageConnect>;
  scriptRes?: { uuid: string };
}

// 构建 ConversationInstance，独立函数避免 this 绑定问题
// （装饰器方法运行时 this 是 GM_Base 实例，不是 CATAgentApi）
function buildInstance(
  ctx: GMBaseContext,
  conv: Conversation,
  options?: ConversationCreateOptions
): ConversationInstance {
  return new ConversationInstance(
    conv,
    ctx.sendMessage.bind(ctx),
    ctx.connect.bind(ctx),
    ctx.scriptRes?.uuid || "",
    options?.maxIterations ?? 20,
    options?.tools,
    options?.commands,
    options?.ephemeral,
    options?.system,
    options?.cache,
    options?.background
  );
}

// CAT.agent.conversation API 对象，注入到脚本上下文
// 使用 @GMContext.API 装饰器注册到 "CAT.agent.conversation" grant
export default class CATAgentApi {
  // 标记为 protected 的内部状态（由 GM_Base 绑定）
  @GMContext.protected()
  protected sendMessage!: (api: string, params: any[]) => Promise<any>;

  @GMContext.protected()
  protected connect!: (api: string, params: any[]) => Promise<MessageConnect>;

  @GMContext.protected()
  protected scriptRes?: any;

  // CAT.agent.conversation.create()
  @GMContext.API({ follow: "CAT.agent.conversation" })
  public "CAT.agent.conversation.create"(options: ConversationCreateOptions = {}): Promise<ConversationInstance> {
    return (async () => {
      if (options.ephemeral) {
        // ephemeral 模式：不发请求到 SW，直接在脚本端构造
        const conv: Conversation = {
          id: options.id || uuidv4(),
          title: "New Chat",
          modelId: options.model || "",
          system: options.system,
          createtime: Date.now(),
          updatetime: Date.now(),
        };
        return buildInstance(this as unknown as GMBaseContext, conv, options);
      }

      const { tools: _tools, ephemeral: _ephemeral, ...serverOptions } = options;
      const conv = (await this.sendMessage("CAT_agentConversation", [
        { action: "create", options: serverOptions, scriptUuid: this.scriptRes?.uuid || "" } as ConversationApiRequest,
      ])) as Conversation;
      return buildInstance(this as unknown as GMBaseContext, conv, options);
    })();
  }

  // CAT.agent.conversation.get()
  @GMContext.API({ follow: "CAT.agent.conversation" })
  public "CAT.agent.conversation.get"(id: string): Promise<ConversationInstance | null> {
    return (async () => {
      const conv = (await this.sendMessage("CAT_agentConversation", [
        { action: "get", id, scriptUuid: this.scriptRes?.uuid || "" } as ConversationApiRequest,
      ])) as Conversation | null;
      if (!conv) return null;
      return buildInstance(this as unknown as GMBaseContext, conv);
    })();
  }
}
