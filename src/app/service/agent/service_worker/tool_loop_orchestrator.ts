import type { AgentChatRepo } from "@App/app/repo/agent_chat";
import type { ScriptToolCallback, ToolExecutorLike } from "@App/app/service/agent/core/tool_registry";
import type {
  AgentModelConfig,
  ChatRequest,
  ChatStreamEvent,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  Attachment,
  SubAgentDetails,
  ContentBlock,
  MessageContent,
  TokenUsage,
} from "@App/app/service/agent/core/types";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { getInputTokenBudget } from "@App/app/service/agent/core/model_context";
import { detectToolCallIssues, type ToolCallRecord } from "@App/app/service/agent/core/tool_call_guard";
import {
  elideOldToolResults,
  elideUntilWithinBudget,
  estimateRequestTokens,
} from "@App/app/service/agent/core/context_elision";
import type { LLMCallResult } from "./llm_client";
import { t } from "@App/locales/locales";
import { prepareAttachmentSnapshot, type AttachmentSnapshot } from "@App/app/service/agent/core/attachment_resolver";

// 上下文占用达到这些比例时，分批裁剪保留窗口外的旧 tool 结果（早于 autoCompact 的 80% 阈值）。
// 按阈值分批触发，并在 60% 以上每新增一个保留窗口重新裁剪，兼顾真正的滑动窗口与 prompt cache 稳定性。
const ELISION_THRESHOLDS = [0.4, 0.6];
// 发送前预算检查的安全阈值：估算的下一次请求体积达到该比例时才触发裁剪/拒绝，避免与 0.9 的硬预算基准脱节
const PREFLIGHT_BUDGET_RATIO = 0.9;
// 保留最近几轮 assistant(带 toolCalls) 及其 tool 结果的完整原文，更早的轮次被裁剪为占位文本
const ELISION_KEEP_LAST_ASSISTANT_TURNS = 5;

// 循环检测（tool_call_guard）连续命中达到此次数时，暂停并询问用户是否继续（仅当调用方提供 askUserForGuard 时生效）
const GUARD_ESCALATION_STRIKES = 2;
const GUARD_STOP_ANSWER = "stop";

type AskUserForGuard = (strikeCount: number) => Promise<string>;

/**
 * Provider 归一化后的实际上下文输入 token。
 * Anthropic 将缓存命中/写入 token 与断点后的 input_tokens 分开返回；OpenAI 的 prompt_tokens 已含缓存部分。
 */
function getContextInputTokens(model: AgentModelConfig, usage: NonNullable<LLMCallResult["usage"]>): number {
  if (model.provider !== "anthropic") return usage.inputTokens;
  return usage.inputTokens + (usage.cacheCreationInputTokens || 0) + (usage.cacheReadInputTokens || 0);
}

/** 等待 loop-guard 回答；AbortSignal 触发时立即返回 null，不再阻塞会话停止/断开。 */
function waitForGuardAnswer(
  askUserForGuard: AskUserForGuard,
  strikeCount: number,
  signal: AbortSignal
): Promise<string | null> {
  if (signal.aborted) return Promise.resolve(null);

  return new Promise<string | null>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const resolveOnce = (answer: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(answer);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => resolveOnce(null);

    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(() => (settled || signal.aborted ? null : askUserForGuard(strikeCount)))
      .then(resolveOnce, rejectOnce);
  });
}

/** ToolLoopOrchestrator 所需的外部依赖（由 AgentService 注入） */
export interface ToolLoopDeps {
  // callLLM 通过 lambda 注入，确保测试 spy 可以拦截
  callLLM(
    model: AgentModelConfig,
    params: {
      messages: ChatRequest["messages"];
      tools?: ToolDefinition[];
      cache?: boolean;
      attachmentSnapshot?: AttachmentSnapshot;
    },
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<LLMCallResult>;
  autoCompact(
    conversationId: string,
    conversationGeneration: string,
    model: AgentModelConfig,
    messages: ChatRequest["messages"],
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<TokenUsage | undefined>;
}

export class ToolLoopOrchestrator {
  // 注意：不在构造器持有 toolRegistry。
  // 每次 callLLMWithToolLoop 由调用方传入（通常是 SessionToolRegistry），
  // 保证并发会话各自使用独立的工具注册表，避免闭包互相覆盖。
  constructor(
    private deps: ToolLoopDeps,
    private chatRepo: AgentChatRepo
  ) {}

  /** 上下文即使裁剪到底也无法容纳下一次请求时，落库 + 通知 UI + （可选）抛出结构化错误。
   * 落库失败不能阻塞事件发送（见 finding 5：事件投递不应依赖持久化成功）；
   * 若此时已被 Stop，取消优先于 context_too_large，改走统一的取消终态化路径。 */
  private async emitContextTooLarge(
    conversationId: string | undefined,
    conversationGeneration: string | undefined,
    totalUsage: {
      inputTokens: number;
      outputTokens: number;
      cacheCreationInputTokens: number;
      cacheReadInputTokens: number;
    },
    startTime: number,
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal,
    throwOnTerminalError?: boolean
  ): Promise<void> {
    if (signal.aborted) {
      await this.emitCancelled(conversationId, conversationGeneration, totalUsage, startTime, sendEvent);
      return;
    }
    const error = Object.assign(new Error("Conversation history exceeds the model context window"), {
      errorCode: "context_too_large",
      usage: totalUsage,
      durationMs: Date.now() - startTime,
      conversationId,
    });
    if (conversationId) {
      try {
        await this.chatRepo.appendMessage(
          {
            id: uuidv4(),
            conversationId,
            role: "assistant",
            content: "",
            error: error.message,
            errorCode: error.errorCode,
            usage: totalUsage,
            durationMs: error.durationMs,
            createtime: Date.now(),
          },
          conversationGeneration
        );
      } catch {
        // 持久化失败不阻塞终态事件发送
      }
    }
    // 持久化期间也可能已被 Stop：取消优先于 context_too_large，不能在 Stop 之后仍对外报告/
    // 抛出 context_too_large（见 finding 5）
    if (signal.aborted) {
      await this.emitCancelled(conversationId, conversationGeneration, totalUsage, startTime, sendEvent);
      return;
    }
    sendEvent({
      type: "error",
      message: error.message,
      errorCode: error.errorCode,
      usage: error.usage,
      durationMs: error.durationMs,
    });
    if (throwOnTerminalError) throw error;
  }

  /** 生成的附件（如模型产出的图片）在被 assistant 消息持久化引用之前只是"本轮租约"：
   * 任何不会把引用消息落库的退出路径（取消、持久化失败、落库异常）都必须删除这些文件，
   * 否则它们会成为无任何消息引用的孤儿附件（见 finding 5）。 */
  private async releaseGeneratedAttachments(result: LLMCallResult): Promise<void> {
    const blocks = result.contentBlocks;
    if (!blocks || blocks.length === 0) return;
    await Promise.all(
      blocks
        .filter((block): block is Exclude<ContentBlock, { type: "text" }> => block.type !== "text")
        .map((block) => this.chatRepo.deleteAttachment(block.attachmentId).catch(() => {}))
    );
  }

  /** 工具轮次落盘状态：确认读本身失败时必须与"确实未提交"区分开——前者是不确定态，不能
   * 被当作可以安全删除附件的证据（见 finding 2）。 */
  private async checkToolRoundDurability(
    conversationId: string,
    conversationGeneration: string | undefined,
    assistantMessage: ChatMessage,
    toolMessages: ChatMessage[]
  ): Promise<"durable" | "not_durable" | "indeterminate"> {
    let snapshot: Awaited<ReturnType<AgentChatRepo["getMessageSnapshot"]>>;
    try {
      snapshot = await this.chatRepo.getMessageSnapshot(conversationId, conversationGeneration);
    } catch {
      // 确认读失败不代表写入未落盘，只是无法证实——不确定态
      return "indeterminate";
    }
    const assistant = snapshot.messages.find(
      (message) => message.id === assistantMessage.id && message.role === "assistant"
    );
    if (!assistant) return "not_durable";
    const expectedToolCallIds = new Set((assistantMessage.toolCalls || []).map((toolCall) => toolCall.id));
    if (toolMessages.length !== expectedToolCallIds.size) return "not_durable";
    const durable = toolMessages.every(
      (expected) =>
        expected.toolCallId !== undefined &&
        expectedToolCallIds.has(expected.toolCallId) &&
        snapshot.messages.some(
          (message) =>
            message.id === expected.id && message.role === "tool" && message.toolCallId === expected.toolCallId
        )
    );
    return durable ? "durable" : "not_durable";
  }

  /** 取消（stop）落定时的统一终态化：持久化一条终态记录 + 发送唯一的终态事件，携带累计 usage/耗时。
   * 落库失败不能阻塞事件发送，否则客户端永远收不到终态事件（见 finding 5）。 */
  private async emitCancelled(
    conversationId: string | undefined,
    conversationGeneration: string | undefined,
    totalUsage: {
      inputTokens: number;
      outputTokens: number;
      cacheCreationInputTokens: number;
      cacheReadInputTokens: number;
    },
    startTime: number,
    sendEvent: (event: ChatStreamEvent) => void
  ): Promise<void> {
    const durationMs = Date.now() - startTime;
    if (conversationId) {
      try {
        await this.chatRepo.appendMessage(
          {
            id: uuidv4(),
            conversationId,
            role: "assistant",
            content: "",
            error: "Conversation cancelled",
            errorCode: "cancelled",
            usage: totalUsage,
            durationMs,
            createtime: Date.now(),
          },
          conversationGeneration
        );
      } catch {
        // 持久化失败不阻塞终态事件发送
      }
    }
    sendEvent({
      type: "error",
      message: "Conversation cancelled",
      errorCode: "cancelled",
      usage: totalUsage,
      durationMs,
    });
  }

  // 统一的 tool calling 循环，UI 和脚本共用
  async callLLMWithToolLoop(params: {
    // 本次调用使用的工具注册表（SessionToolRegistry 或 ToolRegistry）
    toolRegistry: ToolExecutorLike;
    model: AgentModelConfig;
    // 输入 token 预算；未传入时按模型推导（getInputTokenBudget：窗口 - 输出预留 - 安全边际）
    inputTokenBudget?: number;
    messages: ChatRequest["messages"];
    tools?: ToolDefinition[];
    maxIterations: number;
    sendEvent: (event: ChatStreamEvent) => void;
    signal: AbortSignal;
    // 脚本自定义工具的回调，null 表示只用内置工具
    scriptToolCallback: ScriptToolCallback | null;
    // 对话 ID，用于持久化消息（可选，UI 场景由 hooks 自行持久化）
    conversationId?: string;
    // 持久化会话的不可变 generation；旧执行在删除/重建后不得写入新会话。
    conversationGeneration?: string;
    // 跳过内置工具，仅使用传入的 tools（ephemeral 模式）
    skipBuiltinTools?: boolean;
    // 排除的工具名称列表（子代理不可用 ask_user、agent）
    excludeTools?: string[];
    // 是否启用 prompt caching，默认 true
    cache?: boolean;
    // 消息来自持久化历史时，先在独立副本上裁剪旧 tool 结果。
    rehydratedHistory?: boolean;
    // 循环检测连续命中达到 GUARD_ESCALATION_STRIKES 次时调用，暂停循环询问用户是否继续。
    // 仅由 UI 对话（含后台会话）传入；定时任务、子代理不传，保持原有的仅告警不暂停行为。
    askUserForGuard?: AskUserForGuard;
    // 定时任务和子代理需要将 max_iterations 作为失败抛给调用方。
    throwOnTerminalError?: boolean;
  }): Promise<void> {
    const {
      toolRegistry,
      model,
      messages: inputMessages,
      tools,
      maxIterations,
      sendEvent,
      signal,
      scriptToolCallback,
      conversationId,
      conversationGeneration,
      rehydratedHistory,
      throwOnTerminalError,
    } = params;
    const startTime = Date.now();
    const totalUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
    let attachmentSnapshot = await prepareAttachmentSnapshot(
      inputMessages,
      model,
      (id) => this.chatRepo.getAttachment(id),
      signal
    );
    let attachmentSizes = attachmentSnapshot.sizes;
    const budgetWindow = params.inputTokenBudget ?? getInputTokenBudget(model);
    const preflightBudgetWindow = Math.max(1, budgetWindow / PREFLIGHT_BUDGET_RATIO);

    // 持久化历史保留完整结果供 UI 展示；LLM 只使用独立副本，续接时首个请求也先裁剪旧结果。
    const messages = rehydratedHistory ? inputMessages.map((message) => ({ ...message })) : inputMessages;
    if (rehydratedHistory) {
      const initialTools = params.skipBuiltinTools ? tools || [] : toolRegistry.getDefinitions(tools);
      const estimatedInputTokens = estimateRequestTokens(messages, initialTools, attachmentSizes, model);
      const estimatedUsageRatio = estimatedInputTokens / preflightBudgetWindow;
      if (estimatedUsageRatio >= ELISION_THRESHOLDS[0]) {
        const withinBudget = elideUntilWithinBudget(
          messages,
          preflightBudgetWindow,
          initialTools,
          PREFLIGHT_BUDGET_RATIO,
          attachmentSizes,
          model
        );
        if (!withinBudget) {
          await this.emitContextTooLarge(
            conversationId,
            conversationGeneration,
            totalUsage,
            startTime,
            sendEvent,
            signal,
            throwOnTerminalError
          );
          return;
        }
      }
    }

    let iterations = 0;
    const toolCallHistory: ToolCallRecord[] = [];
    let guardStartIndex = 0;
    // 已触发过的裁剪阈值下标（-1 表示尚未触发过），避免同一阈值区间内每轮重复裁剪
    let lastElisionThresholdIndex = -1;
    // 60% 以上按“每新增一个保留窗口”重新裁剪，避免窗口在第二个阈值后停止滑动
    let assistantToolTurns = 0;
    let lastElisionAssistantTurn = 0;
    // 循环检测命中次数，达到 GUARD_ESCALATION_STRIKES 后暂停询问用户
    let guardStrikeCount = 0;

    while (iterations < maxIterations) {
      iterations++;
      if (iterations > 1) {
        attachmentSnapshot = await prepareAttachmentSnapshot(
          messages,
          model,
          (id) => this.chatRepo.getAttachment(id),
          signal
        );
        attachmentSizes = attachmentSnapshot.sizes;
      }

      // 每轮重新获取工具定义（load_skill 可能动态注册了新工具）
      let allToolDefs = params.skipBuiltinTools ? tools || [] : toolRegistry.getDefinitions(tools);
      if (params.excludeTools && params.excludeTools.length > 0) {
        const excludeSet = new Set(params.excludeTools);
        allToolDefs = allToolDefs.filter((t) => !excludeSet.has(t.name));
      }

      // 发送前预算检查：用上一轮真实 usage 判断是否需要裁剪只在响应之后生效，
      // 无法覆盖“上一轮新追加的 tool 结果单独撑爆下一次请求”的情况，必须在这里对
      // 即将发出的完整请求（messages + 当前工具定义）做一次独立估算。
      const preflightTokens = estimateRequestTokens(messages, allToolDefs, attachmentSizes, model);
      if (preflightTokens / preflightBudgetWindow >= PREFLIGHT_BUDGET_RATIO) {
        const withinBudget = elideUntilWithinBudget(
          messages,
          preflightBudgetWindow,
          allToolDefs,
          PREFLIGHT_BUDGET_RATIO,
          attachmentSizes,
          model
        );
        if (!withinBudget) {
          await this.emitContextTooLarge(
            conversationId,
            conversationGeneration,
            totalUsage,
            startTime,
            sendEvent,
            signal,
            throwOnTerminalError
          );
          return;
        }
      }

      // 调用 LLM（重试由 llm_client 内部处理）
      let result: LLMCallResult;
      try {
        result = await this.deps.callLLM(
          model,
          {
            messages,
            tools: allToolDefs.length > 0 ? allToolDefs : undefined,
            cache: params.cache,
            attachmentSnapshot,
          },
          sendEvent,
          signal
        );
      } catch (error) {
        // 无论取消还是真实失败，provider 层挂在错误上的本轮已知部分 usage（如 Anthropic 的
        // message_start、部分 OpenAI 兼容 API 每个 chunk 都带的 usage）都必须并入 totalUsage，
        // 否则这部分已经产生的花费会从终态 usage、定时任务与子代理的累计里丢失（见 finding 6/7）
        const partialUsage = (error as { usage?: LLMCallResult["usage"] })?.usage;
        if (partialUsage) {
          totalUsage.inputTokens += partialUsage.inputTokens;
          totalUsage.outputTokens += partialUsage.outputTokens;
          totalUsage.cacheCreationInputTokens += partialUsage.cacheCreationInputTokens || 0;
          totalUsage.cacheReadInputTokens += partialUsage.cacheReadInputTokens || 0;
        }
        // SSE 解析层现在会在 abort 时 reject（而不是静默挂起，见 content_utils.ts），
        // 这类 reject 必须走统一的取消终态化路径，而不是当作真实错误往外抛
        if (signal.aborted) {
          await this.emitCancelled(conversationId, conversationGeneration, totalUsage, startTime, sendEvent);
          return;
        }
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          usage: totalUsage,
          durationMs: Date.now() - startTime,
          conversationId,
        });
      }

      // 先累计本轮 usage 再检查 aborted：即使取消发生在这次响应之后，其花费也不应从终态 usage 中丢失
      if (result.usage) {
        totalUsage.inputTokens += result.usage.inputTokens;
        totalUsage.outputTokens += result.usage.outputTokens;
        totalUsage.cacheCreationInputTokens += result.usage.cacheCreationInputTokens || 0;
        totalUsage.cacheReadInputTokens += result.usage.cacheReadInputTokens || 0;
      }

      if (signal.aborted) {
        // 本轮生成的附件尚未被任何持久化消息引用，取消退出前必须回收
        await this.releaseGeneratedAttachments(result);
        await this.emitCancelled(conversationId, conversationGeneration, totalUsage, startTime, sendEvent);
        return;
      }

      // 自动 compact：当上下文占用超过 80% 时触发；否则按阈值分批裁剪旧 tool 结果（见下方 pendingElision）
      let pendingElision = false;
      let contextUsageRatio: number | null = null;
      if (result.usage && conversationId) {
        contextUsageRatio = getContextInputTokens(model, result.usage) / budgetWindow;

        if (contextUsageRatio >= 0.8) {
          try {
            const compactUsage = await this.deps.autoCompact(
              conversationId,
              conversationGeneration!,
              model,
              messages,
              sendEvent,
              signal
            );
            if (compactUsage) {
              totalUsage.inputTokens += compactUsage.inputTokens;
              totalUsage.outputTokens += compactUsage.outputTokens;
              totalUsage.cacheCreationInputTokens += compactUsage.cacheCreationInputTokens || 0;
              totalUsage.cacheReadInputTokens += compactUsage.cacheReadInputTokens || 0;
            }
          } catch (error) {
            const compactUsage = (error as { usage?: TokenUsage })?.usage;
            if (compactUsage) {
              totalUsage.inputTokens += compactUsage.inputTokens;
              totalUsage.outputTokens += compactUsage.outputTokens;
              totalUsage.cacheCreationInputTokens += compactUsage.cacheCreationInputTokens || 0;
              totalUsage.cacheReadInputTokens += compactUsage.cacheReadInputTokens || 0;
            }
            // 本轮结果的 assistant 消息不会再持久化，生成的附件必须先回收
            await this.releaseGeneratedAttachments(result);
            if (signal.aborted) {
              await this.emitCancelled(conversationId, conversationGeneration, totalUsage, startTime, sendEvent);
              return;
            }
            throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
              usage: totalUsage,
              durationMs: Date.now() - startTime,
              conversationId,
            });
          }
          // autoCompact 期间可能已被 stop：继续持久化/发送最终消息前必须重新检查，
          // 并统一走取消终态化路径（唯一一条终态事件 + 已回写的累计 usage），而不是静默 return
          if (signal.aborted) {
            await this.releaseGeneratedAttachments(result);
            await this.emitCancelled(conversationId, conversationGeneration, totalUsage, startTime, sendEvent);
            return;
          }
        } else {
          for (let i = 0; i < ELISION_THRESHOLDS.length; i++) {
            if (i > lastElisionThresholdIndex && contextUsageRatio >= ELISION_THRESHOLDS[i]) {
              pendingElision = true;
              lastElisionThresholdIndex = i;
            }
          }
        }
      }

      // 构建 assistant 消息的持久化内容（合并文本和生成的图片 blocks）
      const buildMessageContent = (): MessageContent => {
        if (result.contentBlocks && result.contentBlocks.length > 0) {
          const blocks: ContentBlock[] = [];
          if (result.content) blocks.push({ type: "text", text: result.content });
          blocks.push(...result.contentBlocks);
          return blocks;
        }
        return result.content;
      };

      // 如果有 tool calls，需要执行并继续循环
      if (result.toolCalls && result.toolCalls.length > 0 && allToolDefs.length > 0) {
        // 先构造 assistant 消息，等全部工具结果归一化后与完整 tool 结果组一次性提交。
        let persistedAssistantMessage: ChatMessage | undefined;
        if (conversationId) {
          persistedAssistantMessage = {
            id: uuidv4(),
            conversationId,
            role: "assistant",
            content: buildMessageContent(),
            ownedAttachmentIds: result.contentBlocks
              ?.filter((block) => block.type !== "text")
              .map((block) => block.attachmentId),
            thinking: result.thinking ? { content: result.thinking } : undefined,
            toolCalls: result.toolCalls,
            createtime: Date.now(),
          };
        }

        // 将 assistant 消息加入上下文（带 toolCalls，供 provider 构建 tool_calls 字段）
        messages.push({
          role: "assistant",
          content: buildMessageContent(),
          toolCalls: result.toolCalls,
        });

        // 通过 ToolRegistry 执行工具（内置工具直接执行，脚本工具回调 Sandbox）
        // excludeTools 做后端强校验：被排除的工具名直接返回 error，避免 LLM 盲调绕过白/黑名单
        const excludeToolsSet =
          params.excludeTools && params.excludeTools.length > 0 ? new Set(params.excludeTools) : undefined;
        // 脚本工具通过 raceWithAbort 包裹：abort 时会直接 reject，而不是返回部分结果，
        // 必须捕获后按"取消"处理，复用下面统一的补全逻辑，而不是让异常直接抛出跳过终态化
        let toolResults: Awaited<ReturnType<typeof toolRegistry.execute>>;
        try {
          toolResults = await toolRegistry.execute(result.toolCalls, scriptToolCallback, excludeToolsSet, signal);
        } catch (error) {
          if (!signal.aborted) {
            await this.releaseGeneratedAttachments(result);
            throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
              usage: totalUsage,
              durationMs: Date.now() - startTime,
              conversationId,
            });
          }
          toolResults = [];
        }
        const cancelledDuringTools = signal.aborted;
        // 外部脚本可能返回缺失、重复或未知 ID。始终按请求顺序规整为每个 call 恰好一个结果，
        // 否则下一轮 provider 请求和持久化历史都会违反 tool-call 协议。
        const returnedById = new Map<string, (typeof toolResults)[number]>();
        const requestedIds = new Set(result.toolCalls.map((toolCall) => toolCall.id));
        const discardedOwnedAttachmentIds: string[] = [];
        for (const toolResult of toolResults) {
          if (requestedIds.has(toolResult.id) && !returnedById.has(toolResult.id)) {
            returnedById.set(toolResult.id, toolResult);
          } else {
            discardedOwnedAttachmentIds.push(...(toolResult.ownedAttachmentIds || []));
          }
        }
        await Promise.all(discardedOwnedAttachmentIds.map((id) => this.chatRepo.deleteAttachment(id).catch(() => {})));
        toolResults = result.toolCalls.map(
          (toolCall) =>
            returnedById.get(toolCall.id) || {
              id: toolCall.id,
              result: JSON.stringify({
                error: cancelledDuringTools ? "Tool execution cancelled" : "Tool result missing",
              }),
              error: true,
            }
        );
        for (const toolResult of toolResults) {
          if (!toolResult.usage) continue;
          totalUsage.inputTokens += toolResult.usage.inputTokens;
          totalUsage.outputTokens += toolResult.usage.outputTokens;
          totalUsage.cacheCreationInputTokens += toolResult.usage.cacheCreationInputTokens || 0;
          totalUsage.cacheReadInputTokens += toolResult.usage.cacheReadInputTokens || 0;
        }

        // 将 tool 结果加入消息，并通知 UI 工具执行完成
        // 收集需要回写的 toolCall 元数据（执行状态 / 附件 / 子代理详情）
        const attachmentUpdates = new Map<string, Attachment[]>();
        const ownershipUpdates = new Map<string, string[]>();
        const subAgentUpdates = new Map<string, SubAgentDetails>();
        const completedIds = new Set<string>();
        const failedIds = new Set<string>();

        for (const tr of toolResults) {
          completedIds.add(tr.id);
          if (tr.error) failedIds.add(tr.id);
          if (tr.attachments?.length) {
            attachmentUpdates.set(tr.id, tr.attachments);
          }
          if (tr.ownedAttachmentIds?.length) {
            ownershipUpdates.set(tr.id, tr.ownedAttachmentIds);
          }
          if (tr.subAgentDetails) {
            subAgentUpdates.set(tr.id, tr.subAgentDetails);
          }
        }

        // 工具结果先回写到内存中的 assistant toolCalls，再与全部 tool 消息原子提交；
        // 持久化历史因此不会暴露只有 running assistant 或缺少结果的半轮状态。
        const applyToolUpdates = (toolCalls: ToolCall[]) => {
          for (const tc of toolCalls) {
            if (failedIds.has(tc.id)) tc.status = "error";
            else if (completedIds.has(tc.id)) tc.status = "completed";
            const atts = attachmentUpdates.get(tc.id);
            if (atts) tc.attachments = atts;
            const ownedAttachmentIds = ownershipUpdates.get(tc.id);
            if (ownedAttachmentIds) tc.ownedAttachmentIds = ownedAttachmentIds;
            const sad = subAgentUpdates.get(tc.id);
            if (sad) tc.subAgentDetails = sad;
          }
        };

        // 内存上下文中的 assistant 消息：目标消息一定是刚 push 过 toolCalls 的那条，
        // 从尾部往回找（本轮只追加了少量消息）比 Array.prototype.find 的正向全量扫描更快。
        // persistedAssistantMessage.toolCalls 与这里的 toolCalls 是同一个数组引用（都来自
        // result.toolCalls），因此这一次 applyToolUpdates 同时完成了内存态与待持久化对象的回写。
        let assistantMsg: (typeof messages)[number] | undefined;
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i];
          if (m.role === "assistant" && m.toolCalls?.some((tc: ToolCall) => completedIds.has(tc.id))) {
            assistantMsg = m;
            break;
          }
        }
        if (assistantMsg?.toolCalls) applyToolUpdates(assistantMsg.toolCalls);

        const persistedToolMessages: ChatMessage[] = conversationId
          ? toolResults.map((toolResult) => ({
              id: uuidv4(),
              conversationId,
              role: "tool" as const,
              content: toolResult.result,
              toolCallId: toolResult.id,
              createtime: Date.now(),
            }))
          : [];

        if (persistedAssistantMessage && conversationId) {
          try {
            await this.chatRepo.commitToolRound(
              persistedAssistantMessage,
              persistedToolMessages,
              conversationGeneration
            );
          } catch (error) {
            const durability = await this.checkToolRoundDurability(
              conversationId,
              conversationGeneration,
              persistedAssistantMessage,
              persistedToolMessages
            );
            if (durability === "not_durable") {
              const ownedAttachmentIds = toolResults.flatMap((toolResult) => toolResult.ownedAttachmentIds || []);
              await Promise.all(ownedAttachmentIds.map((id) => this.chatRepo.deleteAttachment(id).catch(() => {})));
              await this.releaseGeneratedAttachments(result);
              throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
                usage: totalUsage,
                durationMs: Date.now() - startTime,
                conversationId,
              });
            }
            // durable：OPFS close 报告了二义性错误，但该轮次确已落盘，发布结果并保留附件。
            // indeterminate：确认读本身失败，无法证实写入未落盘——同样不能删除可能仍被引用的附件（见 finding 2）。
          }
        }

        // Durability is the publication boundary: only committed results enter the next request or UI stream.
        for (const toolResult of toolResults) {
          messages.push({ role: "tool", content: toolResult.result, toolCallId: toolResult.id });
          sendEvent({
            type: "tool_call_complete",
            id: toolResult.id,
            result: toolResult.result,
            status: toolResult.error ? "error" : "completed",
            attachments: toolResult.attachments,
            ownedAttachmentIds: toolResult.ownedAttachmentIds,
          });
        }

        // 工具调用状态已全部回写完毕，取消可以安全终态化了：只发一条终态事件，不再进入循环检测/下一轮。
        // cancelledDuringTools 是工具执行结束时的采样；上面的事件发送/tool 消息持久化/状态回写
        // 都是 await，期间到达的 Stop 也必须在这里被观察到，否则会带着已取消的 signal 继续
        // 进入循环检测甚至下一轮 LLM 调用（见 finding 4）
        if (cancelledDuringTools || signal.aborted) {
          await this.emitCancelled(conversationId, conversationGeneration, totalUsage, startTime, sendEvent);
          return;
        }

        // 记录工具调用历史用于模式检测
        const resultMap = new Map(toolResults.map((r) => [r.id, r]));
        for (const tc of result.toolCalls) {
          const tr = resultMap.get(tc.id);
          toolCallHistory.push({
            name: tc.name,
            args: tc.arguments,
            result: tr?.result ?? "",
            iteration: iterations,
          });
        }

        // 工具调用模式检测：检测重复/循环模式并注入针对性提醒
        // 每次警告后推进 startIndex，避免旧记录持续触发同一条警告
        const toolCallWarning = detectToolCallIssues(toolCallHistory, guardStartIndex);
        if (toolCallWarning) {
          guardStartIndex = toolCallHistory.length;
          messages.push({ role: "user", content: toolCallWarning });
          sendEvent({ type: "system_warning", message: toolCallWarning });
          guardStrikeCount++;

          // 连续命中达到阈值时暂停，询问用户是否继续（仅 UI 对话传入 askUserForGuard 时生效）
          if (guardStrikeCount >= GUARD_ESCALATION_STRIKES && params.askUserForGuard) {
            const answer = await waitForGuardAnswer(params.askUserForGuard, guardStrikeCount, signal);
            if (answer === null) {
              // waitForGuardAnswer 只在 signal abort 时才会返回 null，必须走取消终态化路径，
              // 而不是当作正常完成发 done——否则 Stop 期间恰好卡在等待用户回答会被误报为成功
              await this.emitCancelled(conversationId, conversationGeneration, totalUsage, startTime, sendEvent);
              return;
            }
            if (answer.trim().toLowerCase() === GUARD_STOP_ANSWER.toLowerCase()) {
              const durationMs = Date.now() - startTime;
              if (conversationId) {
                try {
                  await this.chatRepo.appendMessage(
                    {
                      id: uuidv4(),
                      conversationId,
                      role: "assistant",
                      content: t("agent:chat_guard_stopped_message"),
                      usage: totalUsage,
                      durationMs,
                      createtime: Date.now(),
                    },
                    conversationGeneration
                  );
                } catch {
                  // 持久化失败不阻塞终态事件发送
                }
              }
              // 持久化期间也可能已被 Stop：取消优先于 done，不能在 Stop 之后仍报告成功
              if (signal.aborted) {
                await this.emitCancelled(conversationId, conversationGeneration, totalUsage, startTime, sendEvent);
                return;
              }
              sendEvent({ type: "done", usage: totalUsage, durationMs });
              return;
            }
            // 用户选择继续：重置命中计数，避免此后每一次告警都重新弹出询问
            guardStrikeCount = 0;
          }
        }

        assistantToolTurns++;
        // 60% 以上每新增一个完整保留窗口再裁剪一次，既保持窗口滑动，也避免每轮破坏缓存前缀。
        if (
          !pendingElision &&
          contextUsageRatio !== null &&
          contextUsageRatio >= ELISION_THRESHOLDS[ELISION_THRESHOLDS.length - 1] &&
          assistantToolTurns - lastElisionAssistantTurn >= ELISION_KEEP_LAST_ASSISTANT_TURNS
        ) {
          pendingElision = true;
        }

        // 分批裁剪：待本轮 assistant/tool 消息入列后再裁剪，让本轮内容计入"最近 K 轮"窗口
        if (pendingElision) {
          elideOldToolResults(messages, ELISION_KEEP_LAST_ASSISTANT_TURNS);
          lastElisionAssistantTurn = assistantToolTurns;
        }

        // 通知 UI 即将开始新一轮 LLM 调用，创建新的 assistant 消息
        sendEvent({ type: "new_message" });

        // 继续循环
        continue;
      }

      // 没有 tool calls，对话结束。与取消/错误终态不同，done 对外承诺"回复已持久化"；
      // UI 完成回调会重新从 OPFS 加载消息，静默吞掉写入失败仍报 done 会让回复看起来生成成功、
      // 刷新后又消失。这里有限重试几次，仍失败则改报结构化错误而不是假装成功（见 finding 10）。
      const durationMs = Date.now() - startTime;
      let persistFailed = false;
      if (conversationId) {
        const assistantMessage = {
          id: uuidv4(),
          conversationId,
          role: "assistant" as const,
          content: buildMessageContent(),
          ownedAttachmentIds: result.contentBlocks
            ?.filter((block) => block.type !== "text")
            .map((block) => block.attachmentId),
          thinking: result.thinking ? { content: result.thinking } : undefined,
          // 生成图片保存失败等非致命问题：持久化到消息上，刷新后仍然可见，而不是只在这次流式响应里
          // 一闪而过（见 finding 5）
          warning: result.warning,
          usage: totalUsage,
          durationMs,
          createtime: Date.now(),
        };
        const MAX_PERSIST_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= MAX_PERSIST_ATTEMPTS; attempt++) {
          try {
            await this.chatRepo.appendMessage(assistantMessage, conversationGeneration);
            persistFailed = false;
            break;
          } catch {
            persistFailed = true;
            if (attempt < MAX_PERSIST_ATTEMPTS) {
              await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
            }
          }
        }
        // 重试全部失败仍不能断定未落盘：appendMessage 按 id 去重，第一次尝试可能已经真正写入，
        // 只是确认读恰好也持续失败。删除生成的图片附件之前必须 positively 证实消息确实不在
        // 存储里，否则会删掉仍被这条消息引用的文件（见 finding 2）
        if (persistFailed) {
          const committed = await this.chatRepo
            .getMessageSnapshot(conversationId, conversationGeneration)
            .then((snapshot) => snapshot.messages.some((message) => message.id === assistantMessage.id))
            .catch(() => false);
          if (committed) persistFailed = false;
        }
      }

      // 持久化期间也可能已被 stop：内容已经落库（不丢失），但终态事件必须反映取消，
      // 不能在 Stop 之后仍对外报告 done（否则后台会话状态会被"成功"覆盖掉 cancelled）
      if (signal.aborted) {
        // 引用消息未落库（ephemeral 或 persist 失败）时，生成附件没有持久化引用，必须回收
        if (!conversationId || persistFailed) {
          await this.releaseGeneratedAttachments(result);
        }
        await this.emitCancelled(conversationId, conversationGeneration, totalUsage, startTime, sendEvent);
        return;
      }

      if (persistFailed) {
        // 回复消息没有落库成功，生成附件不会有任何持久化引用，回收后再报告失败
        await this.releaseGeneratedAttachments(result);
        sendEvent({
          type: "error",
          message: "Reply was generated but failed to save. It may be lost after reloading.",
          errorCode: "persist_failed",
          usage: totalUsage,
          durationMs,
        });
        return;
      }

      // 生成图片保存失败：done 之前发一次可见警告，让 UI 立即展示（消息里的 warning 字段负责刷新后仍可见）
      if (result.warning) {
        sendEvent({ type: "system_warning", message: result.warning });
      }

      // 发送 done 事件
      sendEvent({ type: "done", usage: totalUsage, durationMs });
      return;
    }

    // 超过最大迭代次数
    const durationMs = Date.now() - startTime;
    const maxIterMsg = `Tool calling loop exceeded maximum iterations (${maxIterations})`;
    if (conversationId) {
      try {
        await this.chatRepo.appendMessage(
          {
            id: uuidv4(),
            conversationId,
            role: "assistant",
            content: "",
            error: maxIterMsg,
            errorCode: "max_iterations",
            usage: totalUsage,
            durationMs,
            createtime: Date.now(),
          },
          conversationGeneration
        );
      } catch {
        // 持久化失败不阻塞终态事件发送
      }
    }
    // 持久化期间也可能已被 Stop：取消优先于 max_iterations
    if (signal.aborted) {
      await this.emitCancelled(conversationId, conversationGeneration, totalUsage, startTime, sendEvent);
      return;
    }
    const terminalError = {
      type: "error",
      message: maxIterMsg,
      errorCode: "max_iterations",
      usage: totalUsage,
      durationMs,
    } as const;
    sendEvent(terminalError);
    if (throwOnTerminalError) {
      throw Object.assign(new Error(maxIterMsg), {
        errorCode: terminalError.errorCode,
        usage: totalUsage,
        durationMs,
        conversationId,
      });
    }
  }
}
