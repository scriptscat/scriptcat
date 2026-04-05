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

// 对话实例，暴露给用户脚本
// 导出供测试使用
export class ConversationInstance {
  private toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>> = new Map();
  private toolDefs: ToolDefinition[] = [];
  private commandHandlers: Map<string, CommandHandler> = new Map();
  private ephemeral: boolean;
  private cache?: boolean;
  private systemPrompt?: string;
  private messageHistory: Array<{
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

    // ephemeral 模式：收集 assistant 响应到内存历史
    if (this.ephemeral) {
      if (reply.toolCalls && reply.toolCalls.length > 0) {
        this.messageHistory.push({ role: "assistant", content: reply.content, toolCalls: reply.toolCalls });
        for (const tc of reply.toolCalls) {
          if (tc.result !== undefined) {
            this.messageHistory.push({ role: "tool", content: tc.result, toolCallId: tc.id });
          }
        }
      }
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

    // ephemeral 模式：包装 stream 以收集 assistant 消息到内存历史
    if (this.ephemeral) {
      return this.processStreamEphemeral(conn, handlers);
    }

    return this.processStream(conn, handlers);
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

  // 合并实例级别和调用级别的工具定义
  private mergeTools(callTools?: ChatOptions["tools"]) {
    const toolDefs: ToolDefinition[] = [...this.toolDefs];
    const handlers = new Map(this.toolHandlers);

    if (callTools) {
      for (const tool of callTools) {
        // 调用级别的工具覆盖实例级别的同名工具
        if (!handlers.has(tool.name)) {
          toolDefs.push({ name: tool.name, description: tool.description, parameters: tool.parameters });
        }
        handlers.set(tool.name, tool.handler);
      }
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
        scriptUuid: this.scriptUuid,
      } as ConversationApiRequest,
    ]);
  }

  // 附加到后台运行中的会话，返回流式事件
  async attach(): Promise<AsyncIterable<StreamChunk>> {
    const conn = await this.gmConnect("CAT_agentAttachToConversation", [
      { conversationId: this.conv.id, scriptUuid: this.scriptUuid },
    ]);
    return this.processStream(conn, new Map());
  }

  // 处理非流式 chat 的响应
  private processChat(
    conn: MessageConnect,
    handlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>
  ): Promise<ChatReply> {
    return new Promise((resolve, reject) => {
      let content = "";
      let thinking = "";
      const toolCalls: ToolCall[] = [];
      const contentBlocks: ContentBlock[] = [];
      let currentToolCall: ToolCall | null = null;
      let usage: { inputTokens: number; outputTokens: number } | undefined;

      conn.onMessage(async (msg: any) => {
        if (msg.action === "executeTools") {
          // Service Worker 请求执行 tools
          const requestedToolCalls: ToolCall[] = msg.data;
          const results = await this.executeTools(requestedToolCalls, handlers);
          conn.sendMessage({ action: "toolResults", data: results });
          return;
        }

        if (msg.action !== "event") return;
        const event: ChatStreamEvent = msg.data;

        switch (event.type) {
          case "content_delta":
            content += event.delta;
            break;
          case "thinking_delta":
            thinking += event.delta;
            break;
          case "content_block_complete":
            // 收集模型生成的图片/文件/音频 blocks（data 已由 finalize 保存到 attachment 存储）
            contentBlocks.push(event.block);
            break;
          case "tool_call_start":
            if (currentToolCall) toolCalls.push(currentToolCall);
            currentToolCall = { ...event.toolCall, arguments: event.toolCall.arguments || "" };
            break;
          case "tool_call_delta":
            if (currentToolCall) currentToolCall.arguments += event.delta;
            break;
          case "done": {
            if (currentToolCall) {
              toolCalls.push(currentToolCall);
              currentToolCall = null;
            }
            if (event.usage) usage = event.usage;
            // 合并文本和 content blocks 到 MessageContent
            let finalContent: MessageContent = content;
            if (contentBlocks.length > 0) {
              const blocks: ContentBlock[] = [];
              if (content) blocks.push({ type: "text", text: content });
              blocks.push(...contentBlocks);
              finalContent = blocks;
            }
            resolve({
              content: finalContent,
              thinking: thinking || undefined,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              usage,
            });
            break;
          }
          case "error":
            reject(Object.assign(new Error(event.message), { errorCode: event.errorCode }));
            break;
        }
      });

      conn.onDisconnect(() => {
        reject(new Error("Connection disconnected"));
      });
    });
  }

  // 处理流式 chat 的响应
  private processStream(
    conn: MessageConnect,
    handlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>
  ): AsyncIterable<StreamChunk> {
    const chunks: StreamChunk[] = [];
    let resolve: (() => void) | null = null;
    let done = false;
    let error: Error | null = null;

    conn.onMessage(async (msg: any) => {
      if (msg.action === "executeTools") {
        const requestedToolCalls: ToolCall[] = msg.data;
        const results = await this.executeTools(requestedToolCalls, handlers);
        conn.sendMessage({ action: "toolResults", data: results });
        return;
      }

      if (msg.action !== "event") return;
      const event: ChatStreamEvent = msg.data;

      let chunk: StreamChunk | null = null;
      switch (event.type) {
        case "content_delta":
          chunk = { type: "content_delta", content: event.delta };
          break;
        case "thinking_delta":
          chunk = { type: "thinking_delta", content: event.delta };
          break;
        case "content_block_complete":
          chunk = { type: "content_block", block: event.block };
          break;
        case "tool_call_start":
          chunk = { type: "tool_call", toolCall: { ...event.toolCall, arguments: "" } };
          break;
        case "done":
          chunk = { type: "done", usage: event.usage };
          done = true;
          break;
        case "error":
          chunk = { type: "error", error: event.message, errorCode: event.errorCode };
          error = Object.assign(new Error(event.message), { errorCode: event.errorCode });
          done = true;
          break;
      }

      if (chunk) {
        chunks.push(chunk);
        resolve?.();
      }
    });

    conn.onDisconnect(() => {
      done = true;
      error = error || new Error("Connection disconnected");
      resolve?.();
    });

    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<StreamChunk>> {
            while (chunks.length === 0 && !done) {
              await new Promise<void>((r) => {
                resolve = r;
              });
            }

            if (chunks.length > 0) {
              return { value: chunks.shift()!, done: false };
            }

            if (error && !done) throw error;
            return { value: undefined as any, done: true };
          },
        };
      },
    };
  }

  // 处理 ephemeral 流式 chat 的响应（收集 assistant 消息到内存历史）
  private processStreamEphemeral(
    conn: MessageConnect,
    handlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>
  ): AsyncIterable<StreamChunk> {
    const inner = this.processStream(conn, handlers);
    const messageHistory = this.messageHistory;
    let content = "";
    const toolCalls: ToolCall[] = [];

    return {
      [Symbol.asyncIterator]() {
        const iter = inner[Symbol.asyncIterator]();
        return {
          async next(): Promise<IteratorResult<StreamChunk>> {
            const result = await iter.next();
            if (result.done) {
              // 流结束时，追加 assistant 消息到历史
              if (content || toolCalls.length > 0) {
                messageHistory.push({
                  role: "assistant",
                  content,
                  toolCalls: toolCalls.length > 0 ? [...toolCalls] : undefined,
                });
              }
              return result;
            }

            const chunk = result.value;
            switch (chunk.type) {
              case "content_delta":
                content += chunk.content || "";
                break;
              case "tool_call":
                if (chunk.toolCall) {
                  toolCalls.push(chunk.toolCall);
                }
                break;
            }
            return result;
          },
        };
      },
    };
  }

  // 执行用户定义的 tool handlers
  private async executeTools(
    toolCalls: ToolCall[],
    handlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>
  ): Promise<Array<{ id: string; result: string }>> {
    const results: Array<{ id: string; result: string }> = [];

    for (const tc of toolCalls) {
      const handler = handlers.get(tc.name);
      if (!handler) {
        results.push({ id: tc.id, result: JSON.stringify({ error: `Tool "${tc.name}" not found` }) });
        continue;
      }

      try {
        let args: Record<string, unknown> = {};
        if (tc.arguments) {
          args = JSON.parse(tc.arguments);
        }
        const result = await handler(args);
        results.push({ id: tc.id, result: typeof result === "string" ? result : JSON.stringify(result) });
      } catch (e: any) {
        const errorMsg =
          e instanceof Error
            ? e.message || e.toString()
            : typeof e === "string"
              ? e
              : String(e) || "Tool execution failed";
        results.push({ id: tc.id, result: JSON.stringify({ error: errorMsg }) });
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
    options?.maxIterations || 20,
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
