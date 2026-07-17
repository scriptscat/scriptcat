import type { IGetSender } from "@Packages/message/server";
import { GetSenderType } from "@Packages/message/server";
import type { MessageConnect } from "@Packages/message/types";
import type {
  AgentModelConfig,
  ChatRequest,
  ChatStreamEvent,
  Conversation,
  ConversationApiRequest,
  MessageContent,
  TokenUsage,
  ToolDefinition,
} from "@App/app/service/agent/core/types";
import type { ScriptToolCallback, ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import type { ToolCall } from "@App/app/service/agent/core/types";
import type { AgentChatRepo } from "@App/app/repo/agent_chat";
import type { AgentConfigRepo } from "@App/app/service/agent/core/agent_config";
import { normalizeChatMaxIterations } from "@App/app/service/agent/core/agent_config";
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
import { toLLMMessages } from "@App/app/service/agent/core/persisted_messages";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { t } from "@App/locales/locales";
import { elideUntilWithinBudget } from "@App/app/service/agent/core/context_elision";
import { getInputTokenBudget } from "@App/app/service/agent/core/model_context";
import type { LLMCallResult } from "./llm_client";
import { prepareAttachmentSnapshot, type AttachmentSnapshot } from "@App/app/service/agent/core/attachment_resolver";

/** ChatService 需要的 execute_script 工具依赖 */
export interface ChatServiceExecuteScriptDeps {
  executeInPage: (code: string, options?: { tabId?: number }) => Promise<{ result: unknown; tabId: number }>;
  executeInSandbox: (code: string, signal?: AbortSignal) => Promise<unknown>;
}

/** ChatService 需要的 LLM 调用依赖 */
export interface ChatServiceLLMDeps {
  callLLM: (
    model: AgentModelConfig,
    params: {
      messages: ChatRequest["messages"];
      tools?: ToolDefinition[];
      cache?: boolean;
      attachmentSnapshot?: AttachmentSnapshot;
    },
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ) => Promise<LLMCallResult>;
  callLLMWithToolLoop: (params: Parameters<ToolLoopOrchestrator["callLLMWithToolLoop"]>[0]) => Promise<void>;
}

/** handleConversationChat 参数类型 */
type ConversationChatParams = {
  conversationId: string;
  message: MessageContent;
  ownedAttachmentIds?: string[];
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

/** chat / compact / clearMessages / 定时任务续接共用的按 conversationId 队列锁 key。
 * 所有对同一会话持久化消息的读改写路径都必须经由这把锁串行，否则 appendMessage 的
 * 读-改-写会互相覆盖丢消息。 */
export function conversationChatLockKey(conversationId: string): string {
  return `agent-chat:${conversationId}`;
}

/** 一次 conversation chat 连接的共享状态。
 * 连接回调（stop / askUserResponse / toolResults / 断开）必须在排队【之前】注册：
 * 断开的端口上注册回调会直接抛错（见 extension_message.ts），而且排队等待期间到达的
 * 断开与 Stop 必须被如实记录，否则临界区开始后要么在死连接上白跑一整条会话，
 * 要么漏掉停止指令（见 finding 2）。 */
interface ChatConnectionSession {
  msgConn: MessageConnect;
  isBackground: boolean;
  abortController: AbortController;
  askResolvers: Map<string, (answer: string) => void>;
  scriptToolCallback: ScriptToolCallback;
  isDisconnected: () => boolean;
  /** 后台模式：临界区内创建 RunningConversation 后回填，供排队期间注册的连接回调路由 stop/askUser */
  rc?: RunningConversation;
  bgListener?: ListenerEntry;
}

/** 为脚本工具连接增加 executeTools 请求批次关联（requestId），并在后台客户端离线后
 * 直接返回结构化错误结果：过期批次的 toolResults 被丢弃，不会被下一个批次误认领；
 * 连接已断开时不再把 executeTools 扔进黑洞，而是立刻回填整批 error 结果，让 tool loop
 * 能继续走统一的失败路径而不是挂起等待。 */
function wrapScriptToolConnection(original: MessageConnect): MessageConnect {
  let disconnected = false;
  let activeRequestId: string | undefined;
  const inboundHandlers: Array<(message: any) => void> = [];

  const failBatch = (message: any, reason: string) => {
    const toolCalls: ToolCall[] = message.data || [];
    queueMicrotask(() => {
      const response = {
        action: "toolResults",
        requestId: message.requestId,
        data: toolCalls.map((toolCall) => ({
          id: toolCall.id,
          result: JSON.stringify({ error: reason }),
          error: true,
        })),
      };
      for (const handler of inboundHandlers) handler(response);
    });
  };

  return {
    onMessage(callback) {
      inboundHandlers.push(callback as (message: any) => void);
      original.onMessage((message: any) => {
        if (message.action === "toolResults") {
          if (!message.requestId || message.requestId !== activeRequestId) return;
          activeRequestId = undefined;
        }
        callback(message);
      });
    },
    sendMessage(message: any) {
      if (message.action === "cancelToolBatch") {
        // 由包装层补上当前批次的 requestId：批次超时后客户端可能仍在串行执行剩余 handler，
        // 明确通知其作废该批次（见 finding 6）；没有进行中的批次则无事可做
        if (!activeRequestId || disconnected) return;
        try {
          original.sendMessage({ ...message, requestId: activeRequestId });
        } catch {
          disconnected = true;
        }
        return;
      }
      if (message.action !== "executeTools") {
        if (!disconnected) original.sendMessage(message);
        return;
      }

      const correlated = { ...message, requestId: uuidv4() };
      activeRequestId = correlated.requestId;
      if (disconnected) {
        failBatch(correlated, "Script tool client is unavailable");
        return;
      }
      try {
        original.sendMessage(correlated);
      } catch (error) {
        disconnected = true;
        failBatch(
          correlated,
          error instanceof Error && error.message ? error.message : "Script tool client is unavailable"
        );
      }
    },
    disconnect(ignoreAlreadyDisconnected?: boolean) {
      original.disconnect(ignoreAlreadyDisconnected);
    },
    onDisconnect(callback) {
      original.onDisconnect((isSelfDisconnected) => {
        disconnected = true;
        callback(isSelfDisconnected);
      });
    },
  };
}

export class ChatService {
  // 正在等待 Sandbox 回复脚本工具结果的会话：此窗口内 chat 持有会话队列锁等待 toolResults，
  // 来自工具 handler 内部的 await conv.clear() 若照常排队会形成"锁等我、我等锁"的死锁（见 finding 2）
  private conversationsAwaitingScriptTools = new Set<string>();
  private activeChats = new Map<string, AbortController>();

  constructor(
    private toolRegistry: ToolRegistry,
    private modelService: AgentModelService,
    private skillService: SkillService,
    private bgSessionManager: BackgroundSessionManager,
    private subAgentService: SubAgentService,
    private executeScriptDeps: ChatServiceExecuteScriptDeps,
    private llmDeps: ChatServiceLLMDeps,
    private chatRepo: AgentChatRepo,
    private agentConfigRepo: AgentConfigRepo
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
        // 会话正在等待脚本工具结果时，这个 clear 很可能来自该工具 handler 内部的
        // await conv.clear()：chat 持有会话队列锁等待 toolResults，clear 排队等锁，
        // 相互等待成死锁。对这个窗口显式拒绝（fail fast）；其余时刻仍与 chat/compact
        // 共用同一把按 conversationId 的队列锁排队执行，避免互相覆盖写入（见 finding 2/5）
        if (this.conversationsAwaitingScriptTools.has(params.conversationId)) {
          throw new Error(
            "Conversation is waiting for script tool results; clearing messages now would deadlock. Finish or stop the chat first."
          );
        }
        return stackAsyncTask(conversationChatLockKey(params.conversationId), async () => {
          const snapshot = await this.chatRepo.getMessageSnapshot(params.conversationId);
          await this.chatRepo.saveMessages(params.conversationId, [], undefined, {
            generation: snapshot.generation,
            expectedRevision: snapshot.revision,
          });
          await this.chatRepo.saveTasks(params.conversationId, [], undefined, snapshot.generation);
          return true;
        });
      case "deleteMessages":
        return stackAsyncTask(conversationChatLockKey(params.conversationId), async () => {
          const snapshot = await this.chatRepo.getMessageSnapshot(params.conversationId);
          const ids = new Set(params.messageIds);
          await this.chatRepo.saveMessages(
            params.conversationId,
            snapshot.messages.filter((message) => !ids.has(message.id)),
            undefined,
            {
              generation: snapshot.generation,
              expectedRevision: snapshot.revision,
              preserveAttachmentIds: params.preserveAttachmentIds,
            }
          );
          return true;
        });
      case "delete": {
        this.activeChats.get(params.conversationId)?.abort();
        this.bgSessionManager.stop(params.conversationId);
        return stackAsyncTask(conversationChatLockKey(params.conversationId), async () => {
          await this.chatRepo.deleteConversation(params.conversationId, {
            generation: params.generation,
            ...(params.revision === undefined ? {} : { expectedRevision: params.revision }),
          });
          return true;
        });
      }
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
    return this.chatRepo.createConversation(conv);
  }

  private async getConversation(id: string): Promise<Conversation | null> {
    const conversations = await this.chatRepo.listConversations();
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) return null;
    return {
      ...conversation,
      generation: conversation.generation || `legacy:${conversation.id}`,
      revision: conversation.revision ?? 0,
    };
  }

  // 统一的流式 conversation chat（UI 和脚本 API 共用）
  // 同一 conversationId 的 chat / compact（compact 复用本方法的 params.compact 分支）都必须与
  // clearMessages 串行执行，避免并发读改写互相覆盖对方的持久化写入（见 finding 5）。
  // "会话正在运行中" 的快速拒绝在排队之前完成，避免重复的后台请求白白卡在队列里等待。
  async handleConversationChat(params: ConversationChatParams, sender: IGetSender) {
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("Conversation chat requires connect mode");
    }
    const msgConn = wrapScriptToolConnection(sender.getConnect()!);

    // 后台模式：非 ephemeral、非 compact 时可用
    const isBackground = params.background === true && !params.ephemeral && !params.compact;

    if (!params.ephemeral && this.conversationsAwaitingScriptTools.has(params.conversationId)) {
      try {
        msgConn.sendMessage({
          action: "event",
          data: {
            type: "error",
            message: "Conversation is waiting for script tool results; reentrant chat is not allowed",
            errorCode: "conversation_busy",
          } as ChatStreamEvent,
        });
      } catch {
        // 端口已断开，无需通知
      }
      return;
    }

    // 检查是否已有后台运行的同一会话（排队前快速拒绝，入锁后还会复查一次）
    if (isBackground && this.bgSessionManager.has(params.conversationId)) {
      try {
        msgConn.sendMessage({
          action: "event",
          data: { type: "error", message: "会话正在运行中" } as ChatStreamEvent,
        });
      } catch {
        // 端口已断开，无需通知
      }
      return;
    }

    const abortController = new AbortController();
    const askResolvers = new Map<string, (answer: string) => void>();
    let isDisconnected = false;

    const session: ChatConnectionSession = {
      msgConn,
      isBackground,
      abortController,
      askResolvers,
      isDisconnected: () => isDisconnected,
      // 立即在下方赋值；提前占位以便连接回调闭包引用 session 对象本身
      scriptToolCallback: null as unknown as ScriptToolCallback,
    };

    // 等待中的脚本工具调用：MessageConnect 断开或 abortController 触发时，
    // 必须主动结束这个 pending promise —— 只有这个连接对应的 Sandbox 能回复 toolResults，
    // 连接一旦断开该调用永远不会有结果，不结束会让整条 tool loop 挂起。
    let pendingScriptCall: {
      toolCalls: ToolCall[];
      settle: (results: Array<{ id: string; result: string; error?: boolean }>) => void;
    } | null = null;

    const scriptToolAbortedResults = (message: string) =>
      pendingScriptCall!.toolCalls.map((tc) => ({
        id: tc.id,
        result: JSON.stringify({ error: message }),
        error: true,
      }));

    const settlePendingScriptCall = (message: string) => {
      if (!pendingScriptCall) return;
      pendingScriptCall.settle(scriptToolAbortedResults(message));
    };

    // 连接回调必须在排队之前注册：断开的端口上注册会直接抛错（见 extension_message.ts），
    // 而且排队等待期间到达的断开/Stop 必须被记录，否则临界区开始后要么在死连接上白跑
    // 一整条会话，要么漏掉停止指令（见 finding 2）
    try {
      msgConn.onDisconnect(() => {
        isDisconnected = true;
        if (isBackground) {
          // 后台模式：只移除 listener，不 abort 整条会话；
          // 但这条连接对应的脚本工具调用必须结束，否则永远等不到 toolResults
          if (session.rc && session.bgListener) session.rc.listeners.delete(session.bgListener);
          settlePendingScriptCall("Script connection disconnected");
        } else {
          abortController.abort();
        }
      });

      msgConn.onMessage((msg: any) => {
        if (msg.action === "toolResults" && pendingScriptCall) {
          const { settle } = pendingScriptCall;
          settle(msg.data);
        }
        if (msg.action === "askUserResponse" && msg.data) {
          const resolver = askResolvers.get(msg.data.id);
          if (resolver) {
            askResolvers.delete(msg.data.id);
            if (session.rc) session.rc.pendingAskUser = undefined;
            resolver(msg.data.answer);
          }
        }
        if (msg.action === "stop") {
          if (session.rc) {
            this.bgSessionManager.stop(params.conversationId, session.rc);
          } else {
            abortController.abort();
          }
        }
      });
    } catch {
      // 连接在注册回调前就已断开：请求方已不存在，直接不入队
      return;
    }

    // abort（stop / 非后台断开）时结束等待中的脚本工具调用，避免循环卡死
    abortController.signal.addEventListener("abort", () => {
      if (pendingScriptCall && !isDisconnected) {
        try {
          msgConn.sendMessage({ action: "cancelToolBatch" });
        } catch {
          // 端口在 abort 竞态中关闭，pending 仍会在下面本地 settle。
        }
      }
      settlePendingScriptCall("Tool execution aborted");
    });

    // 脚本工具单次调用的最长等待时间：Sandbox 长时间无响应（如脚本卡死）时，
    // 主动结束这轮 tool call 而不是无限期挂起整条对话
    const SCRIPT_TOOL_TIMEOUT_MS = 5 * 60 * 1000;

    session.scriptToolCallback = (toolCalls: ToolCall[]) => {
      return new Promise((resolve) => {
        const settle = (results: Array<{ id: string; result: string; error?: boolean }>) => {
          if (pendingScriptCall?.settle !== settle) return;
          pendingScriptCall = null;
          if (!params.ephemeral) this.conversationsAwaitingScriptTools.delete(params.conversationId);
          clearTimeout(timer);
          resolve(results);
        };
        const timer = setTimeout(() => {
          // 先通知客户端作废该批次（包装层补 requestId）：超时后客户端可能仍在串行执行
          // 剩余 handler，其副作用会与下一批次交叠（见 finding 6）
          try {
            msgConn.sendMessage({ action: "cancelToolBatch" });
          } catch {
            // 端口已断开，无需通知
          }
          settle(
            toolCalls.map((tc) => ({
              id: tc.id,
              result: JSON.stringify({ error: "Tool execution timed out" }),
              error: true,
            }))
          );
        }, SCRIPT_TOOL_TIMEOUT_MS);

        pendingScriptCall = { toolCalls, settle };
        if (!params.ephemeral) this.conversationsAwaitingScriptTools.add(params.conversationId);
        try {
          msgConn.sendMessage({ action: "executeTools", data: toolCalls });
        } catch {
          // 包装层已把断开的批次转成 failBatch 错误结果回填，这里仅防御极端时序下的底层抛错
        }

        if (abortController.signal.aborted) {
          settle(scriptToolAbortedResults("Tool execution aborted"));
        }
      });
    };

    // ephemeral 不读写 chatRepo（消息历史由调用方在内存中维护），没有跨请求的持久化竞争，无需排队
    if (params.ephemeral) {
      return this.handleConversationChatLocked(params, session);
    }

    return stackAsyncTask(conversationChatLockKey(params.conversationId), () =>
      this.handleConversationChatLocked(params, session)
    );
  }

  private async handleConversationChatLocked(params: ConversationChatParams, session: ChatConnectionSession) {
    const { msgConn, isBackground, abortController, askResolvers, scriptToolCallback } = session;

    const sendEventDirect = (event: ChatStreamEvent) => {
      if (session.isDisconnected()) return;
      try {
        msgConn.sendMessage({ action: "event", data: event });
      } catch {
        // 端口在竞态下刚好断开，事件无处可送
      }
    };

    // 排队等待期间已被 Stop（前台断开也会 abort）：不再启动，回发终态取消事件收尾
    if (abortController.signal.aborted) {
      sendEventDirect({ type: "error", message: "Conversation cancelled", errorCode: "cancelled" });
      return;
    }

    // 入锁后复查后台占用：排队前的快速拒绝与真正入锁之间存在时间窗（见 finding 2）
    if (isBackground && this.bgSessionManager.has(params.conversationId)) {
      sendEventDirect({ type: "error", message: "会话正在运行中" });
      return;
    }

    // 后台模式：创建 RunningConversation（askResolvers 与排队前注册的连接回调共享同一个 Map）
    let rc: RunningConversation | undefined;
    if (isBackground) {
      rc = {
        conversationId: params.conversationId,
        abortController,
        listeners: new Set(),
        streamingState: { content: "", thinking: "", toolCalls: [] },
        askResolvers,
        tasks: [],
        status: "running",
      };
      this.bgSessionManager.set(params.conversationId, rc);
      session.rc = rc;

      // 初始 listener；排队期间客户端已断开的后台会话照常运行，只是不再挂 listener
      const listener: ListenerEntry = { sendEvent: sendEventDirect };
      session.bgListener = listener;
      if (!session.isDisconnected()) rc.listeners.add(listener);
    }

    let terminalEventSent = false;
    const sendEvent = (event: ChatStreamEvent) => {
      const isParentTerminal = (event.type === "done" || event.type === "error") && !event.subAgent;
      if (isParentTerminal) {
        if (terminalEventSent) return;
        terminalEventSent = true;
      }
      if (rc) {
        // 后台模式：先更新快照，再广播到所有 listener
        this.bgSessionManager.updateStreamingState(rc, event);
        this.bgSessionManager.broadcastEvent(rc, event);
      } else {
        sendEventDirect(event);
      }
    };

    const emitCancelledOnce = (error?: { usage?: TokenUsage; durationMs?: number }) => {
      sendEvent({
        type: "error",
        message: "Conversation cancelled",
        errorCode: "cancelled",
        usage: error?.usage,
        durationMs: error?.durationMs,
      });
    };

    if (!params.ephemeral) this.activeChats.set(params.conversationId, abortController);

    // 循环检测（tool_call_guard）连续命中时暂停询问用户是否继续；复用 ask_user 的事件/resolver 机制，
    // 5 分钟无人应答时默认"继续"，避免无 UI 监听的后台会话被无限期挂起
    const askUserForGuard = (strikeCount: number): Promise<string> => {
      return new Promise((resolve) => {
        if (abortController.signal.aborted) {
          resolve("stop");
          return;
        }
        const askId = `guard_${uuidv4()}`;
        const cleanup = () => abortController.signal.removeEventListener("abort", onAbort);
        // settle 只负责清理与 resolve，不发送任何终态事件；
        // 终态事件（resolved / expired）由每个触发路径各自发送且只发一次，避免重复广播
        const settle = (answer: string) => {
          clearTimeout(timer);
          askResolvers.delete(askId);
          cleanup();
          resolve(answer);
        };
        const onAbort = () => {
          sendEvent({ type: "ask_user_expired", id: askId });
          settle("stop");
        };
        const timer = setTimeout(
          () => {
            sendEvent({ type: "ask_user_expired", id: askId });
            settle("continue");
          },
          5 * 60 * 1000
        );
        sendEvent({
          type: "ask_user",
          id: askId,
          question: t("agent:chat_guard_question", { count: strikeCount }),
          options: [t("agent:chat_guard_continue"), t("agent:chat_guard_stop")],
          optionValues: ["continue", "stop"],
          multiple: false,
          allowCustom: false,
        });
        abortController.signal.addEventListener("abort", onAbort, { once: true });
        askResolvers.set(askId, (answer: string) => {
          sendEvent({ type: "ask_user_resolved", id: askId });
          settle(answer);
        });
      });
    };

    let conversationGeneration: string | undefined;
    try {
      // ephemeral 模式：无状态处理，不从 repo 加载/持久化
      if (params.ephemeral) {
        await this.handleEphemeralChat(params, sendEvent, abortController, scriptToolCallback);
        return;
      }

      // compact 模式：压缩对话历史
      if (params.compact) {
        await this.handleCompactChat(params, sendEvent, abortController);
        if (abortController.signal.aborted) emitCancelledOnce();
        return;
      }

      // 获取对话和模型
      const conv = await this.getConversation(params.conversationId);
      if (!conv) {
        sendEvent({ type: "error", message: "Conversation not found" });
        return;
      }
      conversationGeneration = conv.generation;

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
      // UI 未显式传入 maxIterations 时，使用用户在设置页配置的对话最大循环次数
      const agentConfig = await this.agentConfigRepo.getConfig();

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
        await this.preloadSkillsFromHistory(existingMessages, metaTools, abortController.signal);
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
          // ?? 而非 || ：显式传入 0 不应被当作"未传入"而回退到配置值；
          // 无论来自配置还是直接传参，最终值都经 normalizeChatMaxIterations 兜底截断，
          // 避免非法值（如负数）导致循环立即失败或无限运行
          maxIterations: normalizeChatMaxIterations(params.maxIterations ?? agentConfig.chatMaxIterations),
          sendEvent,
          signal: abortController.signal,
          scriptToolCallback: enableTools && params.tools && params.tools.length > 0 ? scriptToolCallback : null,
          conversationId: params.conversationId,
          conversationGeneration,
          rehydratedHistory: true,
          skipBuiltinTools: !enableTools,
          askUserForGuard: params.scriptUuid ? undefined : askUserForGuard,
        });
        // callLLMWithToolLoop 在 signal.aborted 时是 return（正常 resolve）而非 throw，
        // 因此 abort 落定也会走到这里；必须先收敛 cancelling 为终态，而不是直接当作正常完成清理
        if (rc && abortController.signal.aborted) {
          this.bgSessionManager.finalizeCancelled(params.conversationId, rc);
        } else {
          // 后台模式：正常完成后延迟清理
          this.bgSessionManager.cleanupIfDone(params.conversationId);
        }
      } finally {
        // sessionRegistry 超出作用域后由 GC 清理，无需手动 unregister
        // 清理子代理上下文缓存
        this.subAgentService.cleanup(params.conversationId);
      }
    } catch (e: any) {
      // 后台模式：abort 后必须等待本次执行 promise 真正落定，才能把 cancelling 收敛为终态，
      // 否则 stop() 造成的 cancelling 占位会一直阻塞同 ID 的新会话（见 finalizeCancelled）
      if (abortController.signal.aborted) {
        emitCancelledOnce(e);
        if (rc) {
          this.bgSessionManager.finalizeCancelled(params.conversationId, rc);
        } else {
          this.bgSessionManager.cleanupIfDone(params.conversationId);
        }
        return;
      }
      const errorMsg = e.message || "Unknown error";
      const errorCode = classifyErrorCode(e);
      // 持久化错误消息到 OPFS，确保刷新后仍可见
      if (params.conversationId && !params.ephemeral) {
        try {
          await this.chatRepo.appendMessage(
            {
              id: uuidv4(),
              conversationId: params.conversationId,
              role: "assistant",
              content: "",
              error: errorMsg,
              errorCode,
              usage: e.usage,
              durationMs: e.durationMs,
              createtime: Date.now(),
            },
            conversationGeneration
          );
        } catch {
          // 持久化失败不阻塞错误事件发送
        }
      }
      sendEvent({ type: "error", message: errorMsg, errorCode, usage: e.usage, durationMs: e.durationMs });
      this.bgSessionManager.cleanupIfDone(params.conversationId);
    } finally {
      if (this.activeChats.get(params.conversationId) === abortController) {
        this.activeChats.delete(params.conversationId);
      }
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
        messages.push(...toLLMMessages([msg]));
      }
    }

    // ephemeral 模式无 skill/task 等 session 工具，直接使用全局 toolRegistry
    // （skipBuiltinTools: true 保证 LLM 只看到 params.tools，toolRegistry 仅用于 execute 路由）
    await this.llmDeps.callLLMWithToolLoop({
      toolRegistry: this.toolRegistry,
      model,
      messages,
      tools: params.tools,
      maxIterations: normalizeChatMaxIterations(params.maxIterations ?? 20),
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
    if (!conv.generation) {
      sendEvent({ type: "error", message: "Conversation not found" });
      return;
    }
    const snapshot = await this.chatRepo.getMessageSnapshot(params.conversationId, conv.generation);
    const existingMessages = snapshot.messages;
    const historyMessages = toLLMMessages(existingMessages).filter((msg) => msg.role !== "system");

    if (historyMessages.length === 0) {
      sendEvent({ type: "error", message: "No messages to compact" });
      return;
    }

    // 构建摘要请求
    const summaryMessages: ChatRequest["messages"] = [];
    summaryMessages.push({ role: "system", content: COMPACT_SYSTEM_PROMPT });

    summaryMessages.push(...historyMessages);
    summaryMessages.push({ role: "user", content: buildCompactUserPrompt(params.compactInstruction) });

    const attachmentSnapshot = await prepareAttachmentSnapshot(
      summaryMessages,
      model,
      (id) => this.chatRepo.getAttachment(id),
      abortController.signal
    );
    const inputBudget = getInputTokenBudget(model);
    const effectiveWindow = Math.max(1, Math.floor(inputBudget / 0.9));
    if (!elideUntilWithinBudget(summaryMessages, effectiveWindow, undefined, 0.9, attachmentSnapshot.sizes, model)) {
      sendEvent({
        type: "error",
        message: "Conversation history is too large to compact",
        errorCode: "context_too_large",
      });
      return;
    }

    // 不带 tools 调用 LLM
    const result = await this.llmDeps.callLLM(
      model,
      { messages: summaryMessages, cache: false, attachmentSnapshot },
      sendEvent,
      abortController.signal
    );
    const compactError = (message: string, cause?: unknown) =>
      Object.assign(new Error(message), {
        usage: result.usage,
        durationMs: undefined,
        cause,
      });

    // LLM 调用期间可能已被 stop：落库/广播终态事件前必须重新检查，
    // 否则 cancelled 之后仍可能持久化摘要并发出 compact_done/done
    if (abortController.signal.aborted) throw compactError("Aborted");

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
    // 传入 signal：写入落定前若已 abort，则放弃这次整份覆写而不提交（见 finding 4）
    try {
      await this.chatRepo.saveMessages(params.conversationId, [summaryMessage], abortController.signal, {
        generation: conv.generation,
        expectedRevision: snapshot.revision,
      });
    } catch (error) {
      throw compactError(error instanceof Error ? error.message : String(error), error);
    }

    // 不做旧快照回滚：写入已经通过 revision CAS 线性化；无条件回写会覆盖随后追加的新消息。
    // Stop 只影响终态报告，不得再用进入 compact 时的历史覆盖更新后的状态。
    if (abortController.signal.aborted) {
      throw compactError("Aborted");
    }

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
      const initialTasks = await this.chatRepo.getTasks(params.conversationId, conv.generation);
      const { tools: taskToolDefs } = createTaskTools({
        initialTasks,
        onSave: (tasks, signal) => this.chatRepo.saveTasks(params.conversationId, tasks, signal, conv.generation),
        sendEvent,
      });
      for (const t of taskToolDefs) {
        sessionRegistry.register("session", t.definition, t.executor);
      }

      // Ask user
      if (!params.scriptUuid) {
        const askTool = createAskUserTool(sendEvent, askResolvers, abortController.signal);
        sessionRegistry.register("session", askTool.definition, askTool.executor);
      }

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
    metaTools: Array<{ definition: ToolDefinition; executor: ToolExecutor }>,
    signal?: AbortSignal
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
      if (signal?.aborted) break;
      try {
        await loadSkillMeta.executor.execute({ skill_name: skillName }, signal);
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

    // 添加历史消息（跳过 system；跳过错误占位消息 —— 如超过 max_iterations 时持久化的空 content
    // assistant 消息，仅用于 UI 展示"继续对话"操作，重放给 LLM 会产生空 content 的无意义消息，
    // 部分 provider（如 Anthropic）甚至会因空 content 拒绝请求）
    messages.push(...toLLMMessages(existingMessages).filter((msg) => msg.role !== "system"));

    if (!params.skipSaveUserMessage) {
      // 添加新用户消息到 LLM 上下文并持久化
      messages.push({ role: "user", content: params.message });
      await this.chatRepo.appendMessage(
        {
          id: uuidv4(),
          conversationId: params.conversationId,
          role: "user",
          content: params.message,
          ownedAttachmentIds: params.ownedAttachmentIds,
          createtime: Date.now(),
        },
        conv.generation
      );
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
