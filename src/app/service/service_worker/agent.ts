import type { Group, IGetSender } from "@Packages/message/server";
import { GetSenderType } from "@Packages/message/server";
import type { SystemConfig, AgentModelConfig } from "@App/pkg/config/config";
import type {
  ChatRequest,
  ChatStreamEvent,
  ConversationApiRequest,
  Conversation,
  ToolCall,
  ToolDefinition,
} from "@App/app/service/agent/types";
import { buildOpenAIRequest, parseOpenAIStream } from "@App/app/service/agent/providers/openai";
import { buildAnthropicRequest, parseAnthropicStream } from "@App/app/service/agent/providers/anthropic";
import { AgentChatRepo } from "@App/app/repo/agent_chat";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { ToolRegistry } from "@App/app/service/agent/tool_registry";
import type { ScriptToolCallback } from "@App/app/service/agent/tool_registry";

export class AgentService {
  private repo = new AgentChatRepo();
  private toolRegistry = new ToolRegistry();

  constructor(
    private systemConfig: SystemConfig,
    private group: Group
  ) {}

  init() {
    // UI 聊天（通过 connect 建立流式聊天）
    this.group.on("chat", this.handleChat.bind(this));
    // Sandbox conversation API
    this.group.on("conversation", this.handleConversation.bind(this));
    // Sandbox 流式聊天（通过 connect）
    this.group.on("conversationChat", this.handleConversationChat.bind(this));
  }

  // 获取工具注册表（供外部注册内置工具）
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  // 获取模型配置
  private async getModel(modelId?: string): Promise<AgentModelConfig> {
    const agentConfig = await this.systemConfig.getAgentConfig();
    let model: AgentModelConfig | undefined;
    if (modelId) {
      model = agentConfig.models.find((m: AgentModelConfig) => m.id === modelId);
    }
    if (!model && agentConfig.defaultModelId) {
      model = agentConfig.models.find((m: AgentModelConfig) => m.id === agentConfig.defaultModelId);
    }
    if (!model && agentConfig.models.length > 0) {
      model = agentConfig.models[0];
    }
    if (!model) {
      throw new Error("No model configured. Please configure a model in Agent settings.");
    }
    return model;
  }

  // 处理 conversation API 请求（非流式），供 GMApi 调用
  async handleConversationApi(params: ConversationApiRequest) {
    return this.handleConversation(params);
  }

  // 处理流式 conversation chat，供 GMApi 调用
  async handleConversationChatFromGmApi(
    params: {
      conversationId: string;
      message: string;
      tools?: ToolDefinition[];
      maxIterations?: number;
      scriptUuid: string;
    },
    sender: IGetSender
  ) {
    return this.handleConversationChat(params, sender);
  }

  // 处理 Sandbox conversation API 请求（非流式）
  private async handleConversation(params: ConversationApiRequest) {
    switch (params.action) {
      case "create":
        return this.createConversation(params);
      case "get":
        return this.getConversation(params.id);
      case "getMessages":
        return this.repo.getMessages(params.conversationId);
      case "save":
        // 对话已经在 chat 过程中持久化，这里确保元数据也保存
        return true;
      default:
        throw new Error(`Unknown conversation action: ${(params as any).action}`);
    }
  }

  private async createConversation(params: Extract<ConversationApiRequest, { action: "create" }>) {
    const model = await this.getModel(params.options.model);
    const conv: Conversation = {
      id: params.options.id || uuidv4(),
      title: "New Chat",
      modelId: model.id,
      system: params.options.system,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.repo.saveConversation(conv);
    return conv;
  }

  private async getConversation(id: string): Promise<Conversation | null> {
    const conversations = await this.repo.listConversations();
    return conversations.find((c) => c.id === id) || null;
  }

  // 统一的 tool calling 循环，UI 和脚本共用
  private async callLLMWithToolLoop(params: {
    model: AgentModelConfig;
    messages: ChatRequest["messages"];
    tools?: ToolDefinition[];
    maxIterations: number;
    sendEvent: (event: ChatStreamEvent) => void;
    signal: AbortSignal;
    // 脚本自定义工具的回调，null 表示只用内置工具
    scriptToolCallback: ScriptToolCallback | null;
    // 对话 ID，用于持久化消息（可选，UI 场景由 hooks 自行持久化）
    conversationId?: string;
  }): Promise<void> {
    const { model, messages, tools, maxIterations, sendEvent, signal, scriptToolCallback, conversationId } = params;

    // 合并内置工具和脚本工具定义
    const allToolDefs = this.toolRegistry.getDefinitions(tools);

    let iterations = 0;
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    while (iterations < maxIterations) {
      iterations++;

      // 调用 LLM
      const result = await this.callLLM(
        model,
        { messages, tools: allToolDefs.length > 0 ? allToolDefs : undefined },
        sendEvent,
        signal
      );

      if (signal.aborted) return;

      // 累计 usage
      if (result.usage) {
        totalUsage.inputTokens += result.usage.inputTokens;
        totalUsage.outputTokens += result.usage.outputTokens;
      }

      // 如果有 tool calls，需要执行并继续循环
      if (result.toolCalls && result.toolCalls.length > 0 && allToolDefs.length > 0) {
        // 持久化 assistant 消息（含 tool calls）
        if (conversationId) {
          await this.repo.appendMessage({
            id: uuidv4(),
            conversationId,
            role: "assistant",
            content: result.content,
            toolCalls: result.toolCalls,
            createdAt: Date.now(),
          });
        }

        // 将 assistant 消息加入上下文（带 toolCalls，供 provider 构建 tool_calls 字段）
        messages.push({ role: "assistant", content: result.content || "", toolCalls: result.toolCalls });

        // 通过 ToolRegistry 执行工具（内置工具直接执行，脚本工具回调 Sandbox）
        const toolResults = await this.toolRegistry.execute(result.toolCalls, scriptToolCallback);

        // 将 tool 结果加入消息
        for (const tr of toolResults) {
          messages.push({ role: "tool", content: tr.result, toolCallId: tr.id });
          // 持久化 tool 结果消息
          if (conversationId) {
            await this.repo.appendMessage({
              id: uuidv4(),
              conversationId,
              role: "tool",
              content: tr.result,
              toolCallId: tr.id,
              createdAt: Date.now(),
            });
          }
        }

        // 继续循环
        continue;
      }

      // 没有 tool calls，对话结束
      if (conversationId) {
        await this.repo.appendMessage({
          id: uuidv4(),
          conversationId,
          role: "assistant",
          content: result.content,
          createdAt: Date.now(),
        });
      }

      // 发送 done 事件
      sendEvent({ type: "done", usage: totalUsage });
      return;
    }

    // 超过最大迭代次数
    sendEvent({ type: "error", message: `Tool calling loop exceeded maximum iterations (${maxIterations})` });
  }

  // 处理 Sandbox 的流式 conversation chat（通过 connect）
  private async handleConversationChat(
    params: {
      conversationId: string;
      message: string;
      tools?: ToolDefinition[];
      maxIterations?: number;
      scriptUuid: string;
    },
    sender: IGetSender
  ) {
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("Conversation chat requires connect mode");
    }
    const msgConn = sender.getConnect()!;

    const abortController = new AbortController();
    let isDisconnected = false;

    msgConn.onDisconnect(() => {
      isDisconnected = true;
      abortController.abort();
    });

    const sendEvent = (event: ChatStreamEvent) => {
      if (!isDisconnected) {
        msgConn.sendMessage({ action: "event", data: event });
      }
    };

    // 构建脚本工具回调：通过 MessageConnect 让 Sandbox 执行 handler
    let toolResultResolve: ((results: Array<{ id: string; result: string }>) => void) | null = null;

    msgConn.onMessage((msg: any) => {
      if (msg.action === "toolResults" && toolResultResolve) {
        const resolve = toolResultResolve;
        toolResultResolve = null;
        resolve(msg.data);
      }
    });

    const scriptToolCallback: ScriptToolCallback = (toolCalls: ToolCall[]) => {
      return new Promise((resolve) => {
        toolResultResolve = resolve;
        msgConn.sendMessage({ action: "executeTools", data: toolCalls });
      });
    };

    try {
      // 获取对话和模型
      const conv = await this.getConversation(params.conversationId);
      if (!conv) {
        sendEvent({ type: "error", message: "Conversation not found" });
        return;
      }
      const model = await this.getModel(conv.modelId);

      // 加载历史消息
      const existingMessages = await this.repo.getMessages(params.conversationId);

      // 构建消息列表
      const messages: ChatRequest["messages"] = [];

      // 添加 system 消息
      if (conv.system) {
        messages.push({ role: "system", content: conv.system });
      }

      // 添加历史消息（跳过 system）
      for (const msg of existingMessages) {
        if (msg.role === "system") continue;
        messages.push({ role: msg.role, content: msg.content, toolCallId: msg.toolCallId });
      }

      // 添加新用户消息
      messages.push({ role: "user", content: params.message });

      // 持久化用户消息
      await this.repo.appendMessage({
        id: uuidv4(),
        conversationId: params.conversationId,
        role: "user",
        content: params.message,
        createdAt: Date.now(),
      });

      // 更新对话标题（如果是第一条消息）
      if (existingMessages.length === 0 && conv.title === "New Chat") {
        conv.title = params.message.slice(0, 30) + (params.message.length > 30 ? "..." : "");
        conv.updatedAt = Date.now();
        await this.repo.saveConversation(conv);
      }

      // 使用统一的 tool calling 循环
      await this.callLLMWithToolLoop({
        model,
        messages,
        tools: params.tools,
        maxIterations: params.maxIterations || 20,
        sendEvent,
        signal: abortController.signal,
        scriptToolCallback: params.tools && params.tools.length > 0 ? scriptToolCallback : null,
        conversationId: params.conversationId,
      });
    } catch (e: any) {
      if (abortController.signal.aborted) return;
      sendEvent({ type: "error", message: e.message || "Unknown error" });
    }
  }

  // 调用 LLM 并收集完整响应（内部处理流式）
  private async callLLM(
    model: AgentModelConfig,
    params: { messages: ChatRequest["messages"]; tools?: ToolDefinition[] },
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<{ content: string; toolCalls?: ToolCall[]; usage?: { inputTokens: number; outputTokens: number } }> {
    const chatRequest: ChatRequest = {
      conversationId: "",
      modelId: model.id,
      messages: params.messages,
      tools: params.tools,
    };

    const { url, init } =
      model.provider === "anthropic"
        ? buildAnthropicRequest(model, chatRequest)
        : buildOpenAIRequest(model, chatRequest);

    const response = await fetch(url, { ...init, signal });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let errorMessage = `API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
      } catch {
        if (errorText) errorMessage += ` - ${errorText.slice(0, 200)}`;
      }
      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const parseStream = model.provider === "anthropic" ? parseAnthropicStream : parseOpenAIStream;

    // 收集响应
    let content = "";
    const toolCalls: ToolCall[] = [];
    let currentToolCall: ToolCall | null = null;
    let usage: { inputTokens: number; outputTokens: number } | undefined;

    return new Promise((resolve, reject) => {
      const onEvent = (event: ChatStreamEvent) => {
        // 只转发流式内容事件，done 和 error 由 callLLMWithToolLoop 统一管理
        // 避免在 tool calling 循环中提前发送 done 导致客户端过早 resolve
        if (event.type !== "done" && event.type !== "error") {
          sendEvent(event);
        }

        switch (event.type) {
          case "content_delta":
            content += event.delta;
            break;
          case "tool_call_start":
            currentToolCall = { ...event.toolCall, arguments: event.toolCall.arguments || "" };
            break;
          case "tool_call_delta":
            if (currentToolCall) {
              currentToolCall.arguments += event.delta;
            }
            break;
          case "done":
            // 保存当前的 tool call
            if (currentToolCall) {
              toolCalls.push(currentToolCall);
              currentToolCall = null;
            }
            if (event.usage) {
              usage = event.usage;
            }
            resolve({ content, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, usage });
            break;
          case "error":
            reject(new Error(event.message));
            break;
        }
      };

      parseStream(reader, onEvent, signal).catch(reject);
    });
  }

  // UI 聊天流式处理（现在也走统一的 tool calling 循环）
  private async handleChat(params: ChatRequest, sender: IGetSender) {
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("AI chat requires connect mode");
    }
    const msgConn = sender.getConnect()!;

    // 获取模型配置
    const agentConfig = await this.systemConfig.getAgentConfig();
    const model = agentConfig.models.find((m: AgentModelConfig) => m.id === params.modelId);
    if (!model) {
      msgConn.sendMessage({
        action: "event",
        data: { type: "error", message: "Model not found" } as ChatStreamEvent,
      });
      msgConn.disconnect();
      return;
    }

    const abortController = new AbortController();
    let isDisconnected = false;

    msgConn.onDisconnect(() => {
      isDisconnected = true;
      abortController.abort();
    });

    const sendEvent = (event: ChatStreamEvent) => {
      if (!isDisconnected) {
        msgConn.sendMessage({ action: "event", data: event });
      }
    };

    try {
      // UI 场景：使用统一的 tool calling 循环，scriptToolCallback 为 null（只执行内置工具）
      await this.callLLMWithToolLoop({
        model,
        messages: [...params.messages],
        tools: params.tools,
        maxIterations: 20,
        sendEvent,
        signal: abortController.signal,
        scriptToolCallback: null,
        // UI 场景不由 SW 持久化消息（由 hooks 自行管理）
      });
    } catch (e: any) {
      if (abortController.signal.aborted) return;
      sendEvent({ type: "error", message: e.message || "Unknown error" });
    }
  }
}
