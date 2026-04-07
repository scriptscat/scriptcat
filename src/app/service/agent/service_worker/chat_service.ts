import type { IGetSender } from "@Packages/message/server";
import { GetSenderType } from "@Packages/message/server";
import type {
  AgentModelConfig,
  ChatRequest,
  ChatStreamEvent,
  Conversation,
  ConversationApiRequest,
  MessageContent,
  ToolDefinition,
} from "@App/app/service/agent/core/types";
import type { ScriptToolCallback, ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import type { ToolCall } from "@App/app/service/agent/core/types";
import type { AgentChatRepo } from "@App/app/repo/agent_chat";
import type { ToolRegistry } from "@App/app/service/agent/core/tool_registry";
import { SessionToolRegistry } from "@App/app/service/agent/core/session_tool_registry";
import type { SkillService } from "./skill_service";
import type { BackgroundSessionManager, ListenerEntry, RunningConversation } from "./background_session_manager";
import type { AgentModelService } from "./model_service";
import type { SubAgentService } from "./sub_agent_service";
import type { ToolLoopOrchestrator } from "./tool_loop_orchestrator";
import type { SubAgentRunOptions } from "@App/app/service/agent/core/tools/sub_agent";
import { buildSystemPrompt } from "@App/app/service/agent/core/system_prompt";
import {
  COMPACT_SYSTEM_PROMPT,
  buildCompactUserPrompt,
  extractSummary,
} from "@App/app/service/agent/core/compact_prompt";
import { createTaskTools } from "@App/app/service/agent/core/tools/task_tools";
import { createAskUserTool } from "@App/app/service/agent/core/tools/ask_user";
import { createSubAgentTool } from "@App/app/service/agent/core/tools/sub_agent";
import { createExecuteScriptTool } from "@App/app/service/agent/core/tools/execute_script";
import { resolveSubAgentType } from "@App/app/service/agent/core/sub_agent_types";
import { classifyErrorCode } from "./retry_utils";
import { getTextContent } from "@App/app/service/agent/core/content_utils";
import { uuidv4 } from "@App/pkg/utils/uuid";
import type { LLMCallResult } from "./llm_client";

/** ChatService 需要的 execute_script 工具依赖 */
export interface ChatServiceExecuteScriptDeps {
  executeInPage: (code: string, options?: { tabId?: number }) => Promise<{ result: unknown; tabId: number }>;
  executeInSandbox: (code: string) => Promise<unknown>;
}

/** ChatService 需要的 LLM 调用依赖 */
export interface ChatServiceLLMDeps {
  callLLM: (
    model: AgentModelConfig,
    params: { messages: ChatRequest["messages"]; tools?: ToolDefinition[]; cache?: boolean },
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ) => Promise<LLMCallResult>;
  callLLMWithToolLoop: (params: Parameters<ToolLoopOrchestrator["callLLMWithToolLoop"]>[0]) => Promise<void>;
}

/** handleConversationChat 参数类型 */
type ConversationChatParams = {
  conversationId: string;
  message: MessageContent;
  tools?: ToolDefinition[];
  maxIterations?: number;
  scriptUuid?: string;
  modelId?: string;
  enableTools?: boolean; // 是否携带 tools，undefined 表示不覆盖
  // 用户消息已在存储中（重新生成场景），跳过保存和 LLM 上下文追加
  skipSaveUserMessage?: boolean;
  // ephemeral 会话专用字段
  ephemeral?: boolean;
  messages?: ChatRequest["messages"];
  system?: string;
  cache?: boolean;
  // compact 模式
  compact?: boolean;
  compactInstruction?: string;
  // 后台运行模式
  background?: boolean;
};

/** buildSessionToolRegistry 的返回值 */
interface SessionRegistryResult {
  sessionRegistry: SessionToolRegistry;
  promptSuffix: string;
  enableTools: boolean;
  metaTools: Array<{ definition: ToolDefinition; executor: ToolExecutor }>;
}

/** buildAndPersistUserMessage 的返回值 */
interface BuildMessagesResult {
  messages: ChatRequest["messages"];
}

export class ChatService {
  constructor(
    private toolRegistry: ToolRegistry,
    private modelService: AgentModelService,
    private skillService: SkillService,
    private bgSessionManager: BackgroundSessionManager,
    private subAgentService: SubAgentService,
    private executeScriptDeps: ChatServiceExecuteScriptDeps,
    private llmDeps: ChatServiceLLMDeps,
    private chatRepo: AgentChatRepo
  ) {}

  // 处理 Sandbox conversation API 请求（非流式）
  async handleConversation(params: ConversationApiRequest): Promise<unknown> {
    switch (params.action) {
      case "create":
        return this.createConversation(params);
      case "get":
        return this.getConversation(params.id);
      case "getMessages":
        return this.chatRepo.getMessages(params.conversationId);
      case "save":
        // 对话已经在 chat 过程中持久化，这里确保元数据也保存
        return true;
      case "clearMessages":
        await this.chatRepo.saveMessages(params.conversationId, []);
        return true;
      default:
        throw new Error(`Unknown conversation action: ${(params as any).action}`);
    }
  }

  private async createConversation(params: Extract<ConversationApiRequest, { action: "create" }>) {
    const model = await this.modelService.getModel(params.options.model);
    const conv: Conversation = {
      id: params.options.id || uuidv4(),
      title: "New Chat",
      modelId: model.id,
      system: params.options.system,
      skills: params.options.skills,
      createtime: Date.now(),
      updatetime: Date.now(),
    };
    await this.chatRepo.saveConversation(conv);
    return conv;
  }

  private async getConversation(id: string): Promise<Conversation | null> {
    const conversations = await this.chatRepo.listConversations();
    return conversations.find((c) => c.id === id) || null;
  }

  // 统一的流式 conversation chat（UI 和脚本 API 共用）
  async handleConversationChat(params: ConversationChatParams, sender: IGetSender) {
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("Conversation chat requires connect mode");
    }
    const msgConn = sender.getConnect()!;

    // 后台模式：非 ephemeral、非 compact 时可用
    const isBackground = params.background === true && !params.ephemeral && !params.compact;

    // 检查是否已有后台运行的同一会话
    if (isBackground && this.bgSessionManager.has(params.conversationId)) {
      msgConn.sendMessage({
        action: "event",
        data: { type: "error", message: "会话正在运行中" } as ChatStreamEvent,
      });
      return;
    }

    const abortController = new AbortController();
    let isDisconnected = false;

    // 后台模式：创建 RunningConversation
    let rc: RunningConversation | undefined;
    if (isBackground) {
      rc = {
        conversationId: params.conversationId,
        abortController,
        listeners: new Set(),
        streamingState: { content: "", thinking: "", toolCalls: [] },
        askResolvers: new Map(),
        tasks: [],
        status: "running",
      };
      this.bgSessionManager.set(params.conversationId, rc);
    }

    // ask_user resolvers（后台模式挂在 rc 上，普通模式本地）
    const askResolvers = rc ? rc.askResolvers : new Map<string, (answer: string) => void>();

    const sendEvent = (event: ChatStreamEvent) => {
      if (rc) {
        // 后台模式：先更新快照，再广播到所有 listener
        this.bgSessionManager.updateStreamingState(rc, event);
        this.bgSessionManager.broadcastEvent(rc, event);
      } else {
        if (!isDisconnected) {
          msgConn.sendMessage({ action: "event", data: event });
        }
      }
    };

    if (rc) {
      // 后台模式：初始 listener
      const listener: ListenerEntry = {
        sendEvent: (event) => {
          if (!isDisconnected) {
            msgConn.sendMessage({ action: "event", data: event });
          }
        },
      };
      rc.listeners.add(listener);

      msgConn.onDisconnect(() => {
        isDisconnected = true;
        // 后台模式：只移除 listener，不 abort
        rc!.listeners.delete(listener);
      });
    } else {
      msgConn.onDisconnect(() => {
        isDisconnected = true;
        abortController.abort();
      });
    }

    // 构建脚本工具回调：通过 MessageConnect 让 Sandbox 执行 handler
    let toolResultResolve: ((results: Array<{ id: string; result: string }>) => void) | null = null;

    msgConn.onMessage((msg: any) => {
      if (msg.action === "toolResults" && toolResultResolve) {
        const resolve = toolResultResolve;
        toolResultResolve = null;
        resolve(msg.data);
      }
      if (msg.action === "askUserResponse" && msg.data) {
        const resolver = askResolvers.get(msg.data.id);
        if (resolver) {
          askResolvers.delete(msg.data.id);
          if (rc) rc.pendingAskUser = undefined;
          resolver(msg.data.answer);
        }
      }
      if (msg.action === "stop") {
        abortController.abort();
      }
    });

    const scriptToolCallback: ScriptToolCallback = (toolCalls: ToolCall[]) => {
      return new Promise((resolve) => {
        toolResultResolve = resolve;
        msgConn.sendMessage({ action: "executeTools", data: toolCalls });
      });
    };

    try {
      // ephemeral 模式：无状态处理，不从 repo 加载/持久化
      if (params.ephemeral) {
        await this.handleEphemeralChat(params, sendEvent, abortController, scriptToolCallback);
        return;
      }

      // compact 模式：压缩对话历史
      if (params.compact) {
        await this.handleCompactChat(params, sendEvent, abortController);
        return;
      }

      // 获取对话和模型
      const conv = await this.getConversation(params.conversationId);
      if (!conv) {
        sendEvent({ type: "error", message: "Conversation not found" });
        return;
      }

      // UI 传入 modelId / enableTools 时覆盖 conversation 的配置
      let needSave = false;
      if (params.modelId && params.modelId !== conv.modelId) {
        conv.modelId = params.modelId;
        needSave = true;
      }
      if (params.enableTools !== undefined && params.enableTools !== conv.enableTools) {
        conv.enableTools = params.enableTools;
        needSave = true;
      }
      if (needSave) {
        conv.updatetime = Date.now();
        await this.chatRepo.saveConversation(conv);
      }

      const model = await this.modelService.getModel(conv.modelId);

      // 构建 session 级工具注册表
      const { sessionRegistry, promptSuffix, enableTools, metaTools } = await this.buildSessionToolRegistry({
        conv,
        model,
        params,
        sendEvent,
        abortController,
        askResolvers,
      });

      // 加载历史消息
      const existingMessages = await this.chatRepo.getMessages(params.conversationId);

      // 预加载历史中已使用过的 skill 工具
      if (enableTools) {
        await this.preloadSkillsFromHistory(existingMessages, metaTools);
      }

      // 构建消息列表并持久化用户消息
      const { messages } = await this.buildAndPersistUserMessage({
        conv,
        params,
        existingMessages,
        enableTools,
        promptSuffix,
      });

      try {
        // 使用统一的 tool calling 循环（传入 session 级工具注册表，确保并发隔离）
        await this.llmDeps.callLLMWithToolLoop({
          toolRegistry: sessionRegistry,
          model,
          messages,
          tools: enableTools ? params.tools : undefined,
          maxIterations: params.maxIterations || 50,
          sendEvent,
          signal: abortController.signal,
          scriptToolCallback: enableTools && params.tools && params.tools.length > 0 ? scriptToolCallback : null,
          conversationId: params.conversationId,
          skipBuiltinTools: !enableTools,
        });
        // 后台模式：正常完成后延迟清理
        this.bgSessionManager.cleanupIfDone(params.conversationId);
      } finally {
        // sessionRegistry 超出作用域后由 GC 清理，无需手动 unregister
        // 清理子代理上下文缓存
        this.subAgentService.cleanup(params.conversationId);
      }
    } catch (e: any) {
      // 后台模式：abort 也需要清理注册表
      if (abortController.signal.aborted) {
        this.bgSessionManager.cleanupIfDone(params.conversationId);
        return;
      }
      const errorMsg = e.message || "Unknown error";
      // 持久化错误消息到 OPFS，确保刷新后仍可见
      if (params.conversationId && !params.ephemeral) {
        try {
          await this.chatRepo.appendMessage({
            id: uuidv4(),
            conversationId: params.conversationId,
            role: "assistant",
            content: "",
            error: errorMsg,
            createtime: Date.now(),
          });
        } catch {
          // 持久化失败不阻塞错误事件发送
        }
      }
      sendEvent({ type: "error", message: errorMsg, errorCode: classifyErrorCode(e) });
      this.bgSessionManager.cleanupIfDone(params.conversationId);
    }
  }

  /**
   * ephemeral 模式处理：无状态，不读写 repo，消息历史由调用方维护。
   * 直接使用全局 toolRegistry 路由，skipBuiltinTools=true 保证 LLM 只看到 params.tools。
   */
  private async handleEphemeralChat(
    params: ConversationChatParams,
    sendEvent: (event: ChatStreamEvent) => void,
    abortController: AbortController,
    scriptToolCallback: ScriptToolCallback
  ): Promise<void> {
    const model = await this.modelService.getModel(params.modelId);

    // 使用脚本传入的完整消息历史
    const messages: ChatRequest["messages"] = [];

    // 添加 system prompt（内置提示词 + 用户自定义）
    const ephemeralSystem = buildSystemPrompt({ userSystem: params.system });
    messages.push({ role: "system", content: ephemeralSystem });

    // 添加脚本端维护的消息历史（已含最新 user message）
    if (params.messages) {
      for (const msg of params.messages) {
        messages.push({
          role: msg.role,
          content: msg.content,
          toolCallId: msg.toolCallId,
          toolCalls: msg.toolCalls,
        });
      }
    }

    // ephemeral 模式无 skill/task 等 session 工具，直接使用全局 toolRegistry
    // （skipBuiltinTools: true 保证 LLM 只看到 params.tools，toolRegistry 仅用于 execute 路由）
    await this.llmDeps.callLLMWithToolLoop({
      toolRegistry: this.toolRegistry,
      model,
      messages,
      tools: params.tools,
      maxIterations: params.maxIterations || 20,
      sendEvent,
      signal: abortController.signal,
      scriptToolCallback: params.tools && params.tools.length > 0 ? scriptToolCallback : null,
      skipBuiltinTools: true,
      cache: params.cache,
    });
  }

  /**
   * compact 模式处理：用 LLM 对历史消息生成摘要，替换 repo 中的全量历史。
   */
  private async handleCompactChat(
    params: ConversationChatParams,
    sendEvent: (event: ChatStreamEvent) => void,
    abortController: AbortController
  ): Promise<void> {
    const conv = await this.getConversation(params.conversationId);
    if (!conv) {
      sendEvent({ type: "error", message: "Conversation not found" });
      return;
    }

    const model = await this.modelService.getModel(params.modelId || conv.modelId);
    const existingMessages = await this.chatRepo.getMessages(params.conversationId);

    if (existingMessages.filter((m) => m.role !== "system").length === 0) {
      sendEvent({ type: "error", message: "No messages to compact" });
      return;
    }

    // 构建摘要请求
    const summaryMessages: ChatRequest["messages"] = [];
    summaryMessages.push({ role: "system", content: COMPACT_SYSTEM_PROMPT });

    for (const msg of existingMessages) {
      if (msg.role === "system") continue;
      summaryMessages.push({
        role: msg.role,
        content: msg.content,
        toolCallId: msg.toolCallId,
        toolCalls: msg.toolCalls,
      });
    }

    summaryMessages.push({ role: "user", content: buildCompactUserPrompt(params.compactInstruction) });

    // 不带 tools 调用 LLM
    const result = await this.llmDeps.callLLM(
      model,
      { messages: summaryMessages, cache: false },
      sendEvent,
      abortController.signal
    );

    const summary = extractSummary(result.content);
    const originalCount = existingMessages.length;

    // 用摘要消息替换历史
    const summaryMessage = {
      id: uuidv4(),
      conversationId: params.conversationId,
      role: "user" as const,
      content: `[Conversation Summary]\n\n${summary}`,
      createtime: Date.now(),
    };
    await this.chatRepo.saveMessages(params.conversationId, [summaryMessage]);

    sendEvent({ type: "compact_done", summary, originalCount });
    sendEvent({ type: "done", usage: result.usage });
  }

  /**
   * 构建 session 级工具注册表。
   * 每个 chat 请求独立一个 SessionToolRegistry（parent = 全局 toolRegistry），
   * 注册 skill meta-tools、task tools、ask_user、sub_agent、execute_script。
   * session 超出作用域后由 GC 清理。
   */
  private async buildSessionToolRegistry(ctx: {
    conv: Conversation;
    model: AgentModelConfig;
    params: ConversationChatParams;
    sendEvent: (event: ChatStreamEvent) => void;
    abortController: AbortController;
    askResolvers: Map<string, (answer: string) => void>;
  }): Promise<SessionRegistryResult> {
    const { conv, model, params, sendEvent, abortController, askResolvers } = ctx;

    // enableTools 默认为 true
    const enableTools = conv.enableTools !== false;

    // 每个 chat 请求一个独立的 SessionToolRegistry（parent = 全局 toolRegistry）
    // 会话级 meta-tools（skill / task / ask_user / sub_agent / execute_script）只注册到 session，
    // 避免并发会话的闭包互相覆盖。session 超出作用域后由 GC 清理，无需手动 unregister。
    const sessionRegistry = new SessionToolRegistry(this.toolRegistry);

    // 解析 Skills（注入 prompt + 注册 meta-tools），仅在启用 tools 时执行
    let promptSuffix = "";
    let metaTools: Array<{ definition: ToolDefinition; executor: ToolExecutor }> = [];
    if (enableTools) {
      const resolved = this.skillService.resolveSkills(conv.skills);
      promptSuffix = resolved.promptSuffix;
      metaTools = resolved.metaTools;

      // 注册 skill meta-tools 到 session
      for (const mt of metaTools) {
        sessionRegistry.register("skill", mt.definition, mt.executor);
      }

      // Task tools（从持久化加载，变更时保存并推送事件到 UI）
      const initialTasks = await this.chatRepo.getTasks(params.conversationId);
      const { tools: taskToolDefs } = createTaskTools({
        initialTasks,
        onSave: (tasks) => this.chatRepo.saveTasks(params.conversationId, tasks),
        sendEvent,
      });
      for (const t of taskToolDefs) {
        sessionRegistry.register("session", t.definition, t.executor);
      }

      // Ask user
      const askTool = createAskUserTool(sendEvent, askResolvers);
      sessionRegistry.register("session", askTool.definition, askTool.executor);

      // Sub-agent
      const subAgentTool = createSubAgentTool({
        runSubAgent: (options: SubAgentRunOptions) => {
          const agentId = uuidv4();
          const typeConfig = resolveSubAgentType(options.type);
          // 组合父信号和类型配置的超时信号
          const subSignal = AbortSignal.any([abortController.signal, AbortSignal.timeout(typeConfig.timeoutMs)]);

          // 为子代理创建完全独立的工具注册表（共享全局只读 parent，session 工具独立创建）
          const childRegistry = new SessionToolRegistry(this.toolRegistry);

          const subSendEvent = (evt: ChatStreamEvent) =>
            sendEvent({
              ...evt,
              subAgent: {
                agentId,
                description: options.description || "Sub-agent task",
                subAgentType: typeConfig.name,
              },
            } as ChatStreamEvent);

          // 独立的 task 工具（子代理有自己的任务列表）
          const { tools: childTaskTools } = createTaskTools({ sendEvent: subSendEvent });
          for (const t of childTaskTools) {
            childRegistry.register("session", t.definition, t.executor);
          }

          // 独立的 execute_script
          const childExecTool = createExecuteScriptTool(this.executeScriptDeps);
          childRegistry.register("session", childExecTool.definition, childExecTool.executor);

          // general 类型：独立的 skill meta-tools（load_skill / execute_skill_script / read_reference）
          let skillPromptSuffix = "";
          if (typeConfig.name === "general" && conv.skills) {
            const resolved = this.skillService.resolveSkills(conv.skills);
            skillPromptSuffix = resolved.promptSuffix;
            for (const mt of resolved.metaTools) {
              childRegistry.register("skill", mt.definition, mt.executor);
            }
          }

          return this.subAgentService.runSubAgent({
            options: { ...options, description: options.description || "Sub-agent task" },
            agentId,
            model,
            parentConversationId: params.conversationId,
            signal: subSignal,
            toolRegistry: childRegistry,
            skillPromptSuffix,
            sendEvent: subSendEvent,
          });
        },
      });
      sessionRegistry.register("session", subAgentTool.definition, subAgentTool.executor);

      // Execute script
      const executeScriptTool = createExecuteScriptTool(this.executeScriptDeps);
      sessionRegistry.register("session", executeScriptTool.definition, executeScriptTool.executor);
    }

    return { sessionRegistry, promptSuffix, enableTools, metaTools };
  }

  /**
   * 扫描历史消息中的 load_skill 调用，预执行以恢复动态注册的工具。
   * 只需要副作用（注册工具），不关心执行结果。
   */
  private async preloadSkillsFromHistory(
    existingMessages: Awaited<ReturnType<AgentChatRepo["getMessages"]>>,
    metaTools: Array<{ definition: ToolDefinition; executor: ToolExecutor }>
  ): Promise<void> {
    const loadSkillMeta = metaTools.find((mt) => mt.definition.name === "load_skill");
    if (!loadSkillMeta) return;

    const loadedSkillNames = new Set<string>();
    for (const msg of existingMessages) {
      if (msg.role === "assistant" && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.name === "load_skill") {
            try {
              const args = JSON.parse(tc.arguments || "{}");
              if (args.skill_name) {
                loadedSkillNames.add(args.skill_name);
              }
            } catch {
              // 解析失败，跳过
            }
          }
        }
      }
    }

    // 预执行 load_skill 以注册动态工具（结果不需要，只需要副作用）
    for (const skillName of loadedSkillNames) {
      try {
        await loadSkillMeta.executor.execute({ skill_name: skillName });
      } catch {
        // 加载失败，跳过
      }
    }
  }

  /**
   * 构建 LLM 消息列表，持久化新用户消息，并在首次对话时更新标题。
   */
  private async buildAndPersistUserMessage(ctx: {
    conv: Conversation;
    params: ConversationChatParams;
    existingMessages: Awaited<ReturnType<AgentChatRepo["getMessages"]>>;
    enableTools: boolean;
    promptSuffix: string;
  }): Promise<BuildMessagesResult> {
    const { conv, params, existingMessages, enableTools, promptSuffix } = ctx;

    // 构建消息列表
    const messages: ChatRequest["messages"] = [];

    // 添加 system 消息（内置提示词 + 用户自定义 + skill prompt）
    const systemContent = buildSystemPrompt({
      userSystem: conv.system,
      skillSuffix: enableTools ? promptSuffix : undefined,
    });
    messages.push({ role: "system", content: systemContent });

    // 添加历史消息（跳过 system）
    for (const msg of existingMessages) {
      if (msg.role === "system") continue;
      messages.push({
        role: msg.role,
        content: msg.content,
        toolCallId: msg.toolCallId,
        toolCalls: msg.toolCalls,
      });
    }

    if (!params.skipSaveUserMessage) {
      // 添加新用户消息到 LLM 上下文并持久化
      messages.push({ role: "user", content: params.message });
      await this.chatRepo.appendMessage({
        id: uuidv4(),
        conversationId: params.conversationId,
        role: "user",
        content: params.message,
        createtime: Date.now(),
      });
    }

    // 更新对话标题（如果是第一条消息）
    if (existingMessages.length === 0 && conv.title === "New Chat") {
      const titleText = getTextContent(params.message);
      conv.title = titleText.slice(0, 30) + (titleText.length > 30 ? "..." : "");
      conv.updatetime = Date.now();
      await this.chatRepo.saveConversation(conv);
    }

    return { messages };
  }
}
