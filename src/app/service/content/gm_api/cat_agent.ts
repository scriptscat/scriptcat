import GMContext from "./gm_context";
import type { MessageConnect } from "@Packages/message/types";
import type {
  ChatReply,
  ChatStreamEvent,
  Conversation,
  ConversationApiRequest,
  ConversationCreateOptions,
  ChatOptions,
  StreamChunk,
  ToolCall,
  ToolDefinition,
  ChatMessage,
} from "@App/app/service/agent/types";

// 对话实例，暴露给用户脚本
class ConversationInstance {
  private toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>> = new Map();
  private toolDefs: ToolDefinition[] = [];

  constructor(
    private conv: Conversation,
    private gmSendMessage: (api: string, params: any[]) => Promise<any>,
    private gmConnect: (api: string, params: any[]) => Promise<MessageConnect>,
    private scriptUuid: string,
    private maxIterations: number,
    initialTools?: ConversationCreateOptions["tools"]
  ) {
    if (initialTools) {
      for (const tool of initialTools) {
        this.toolHandlers.set(tool.name, tool.handler);
        this.toolDefs.push({ name: tool.name, description: tool.description, parameters: tool.parameters });
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
  async chat(content: string, options?: ChatOptions): Promise<ChatReply> {
    const { toolDefs, handlers } = this.mergeTools(options?.tools);

    // 通过 GM API connect 建立流式连接
    const conn = await this.gmConnect("CAT_agentConversationChat", [
      {
        conversationId: this.conv.id,
        message: content,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        maxIterations: this.maxIterations,
        scriptUuid: this.scriptUuid,
      },
    ]);

    return this.processChat(conn, handlers);
  }

  // 流式发送消息
  async chatStream(content: string, options?: ChatOptions): Promise<AsyncIterable<StreamChunk>> {
    const { toolDefs, handlers } = this.mergeTools(options?.tools);

    const conn = await this.gmConnect("CAT_agentConversationChat", [
      {
        conversationId: this.conv.id,
        message: content,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        maxIterations: this.maxIterations,
        scriptUuid: this.scriptUuid,
      },
    ]);

    return this.processStream(conn, handlers);
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

  // 处理非流式 chat 的响应
  private processChat(
    conn: MessageConnect,
    handlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>
  ): Promise<ChatReply> {
    return new Promise((resolve, reject) => {
      let content = "";
      let thinking = "";
      const toolCalls: ToolCall[] = [];
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
          case "tool_call_start":
            if (currentToolCall) toolCalls.push(currentToolCall);
            currentToolCall = { ...event.toolCall, arguments: event.toolCall.arguments || "" };
            break;
          case "tool_call_delta":
            if (currentToolCall) currentToolCall.arguments += event.delta;
            break;
          case "done":
            if (currentToolCall) {
              toolCalls.push(currentToolCall);
              currentToolCall = null;
            }
            if (event.usage) usage = event.usage;
            resolve({
              content,
              thinking: thinking || undefined,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              usage,
            });
            break;
          case "error":
            reject(new Error(event.message));
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
        case "tool_call_start":
          chunk = { type: "tool_call", toolCall: { ...event.toolCall, arguments: "" } };
          break;
        case "done":
          chunk = { type: "done", usage: event.usage };
          done = true;
          break;
        case "error":
          chunk = { type: "error", error: event.message };
          error = new Error(event.message);
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
        results.push({ id: tc.id, result: JSON.stringify({ error: e.message || "Tool execution failed" }) });
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
    options?.tools
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
      const { tools: _tools, ...serverOptions } = options;
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
