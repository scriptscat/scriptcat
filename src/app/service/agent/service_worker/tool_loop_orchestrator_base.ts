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
import { getContextWindow } from "@App/app/service/agent/core/model_context";
import { detectToolCallIssues, type ToolCallRecord } from "@App/app/service/agent/core/tool_call_guard";
import {
  elideOldToolResults,
  elideUntilWithinBudget,
  estimateRequestTokens,
  loadAttachmentSizes,
} from "@App/app/service/agent/core/context_elision";
import type { LLMCallResult } from "./llm_client";
import { t } from "@App/locales/locales";

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
    },
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<LLMCallResult>;
  autoCompact(
    conversationId: string,
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

  /** 上下文即使裁剪到底也无法容纳下一次请求时，落库 + 通知 UI + （可选）抛出结构化错误。 */
  private async emitContextTooLarge(
    conversationId: string | undefined,
    totalUsage: {
      inputTokens: number;
      outputTokens: number;
      cacheCreationInputTokens: number;
      cacheReadInputTokens: number;
    },
    startTime: number,
    sendEvent: (event: ChatStreamEvent) => void,
    throwOnTerminalError?: boolean
  ): Promise<void> {
    const error = Object.assign(new Error("Conversation history exceeds the model context window"), {
      errorCode: "context_too_large",
      usage: totalUsage,
      durationMs: Date.now() - startTime,
      conversationId,
    });
    if (conversationId) {
      await this.chatRepo.appendMessage({
        id: uuidv4(),
        conversationId,
        role: "assistant",
        content: "",
        error: error.message,
        errorCode: error.errorCode,
        usage: totalUsage,
        durationMs: error.durationMs,
        createtime: Date.now(),
      });
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

  /** 取消（stop）落定时的统一终态化：持久化一条终态记录 + 发送唯一的终态事件，携带累计 usage/耗时。 */
  private async emitCancelled(
    conversationId: string | undefined,
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
      await this.chatRepo.appendMessage({
        id: uuidv4(),
        conversationId,
        role: "assistant",
        content: "",
        error: "Conversation cancelled",
        errorCode: "cancelled",
        usage: totalUsage,
        durationMs,
        createtime: Date.now(),
      });
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
      inputTokenBudget,
      messages: inputMessages,
      tools,
      maxIterations,
      sendEvent,
      signal,
      scriptToolCallback,
      conversationId,
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
    const attachmentSizes = await loadAttachmentSizes(inputMessages, (id) => this.chatRepo.getAttachment(id));
    const budgetWindow = inputTokenBudget ?? getContextWindow(model);
    const preflightBudgetWindow =
      inputTokenBudget === undefined ? budgetWindow : Math.max(1, inputTokenBudget / PREFLIGHT_BUDGET_RATIO);

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
          await this.emitContextTooLarge(conversationId, totalUsage, startTime, sendEvent, throwOnTerminalError);
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
          await this.emitContextTooLarge(conversationId, totalUsage, startTime, sendEvent, throwOnTerminalError);
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
          },
          sendEvent,
          signal
        );
      } catch (error) {
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
        await this.emitCancelled(conversationId, totalUsage, startTime, sendEvent);
        return;
      }

      // 自动 compact：当上下文占用超过 80% 时触发；否则按阈值分批裁剪旧 tool 结果（见下方 pendingElision）
      let pendingElision = false;
      let contextUsageRatio: number | null = null;
      if (result.usage && conversationId) {
        contextUsageRatio = getContextInputTokens(model, result.usage) / budgetWindow;

        if (contextUsageRatio >= 0.8) {
          try {
            const compactUsage = await this.deps.autoCompact(conversationId, model, messages, sendEvent, signal);
            if (compactUsage) {
              totalUsage.inputTokens += compactUsage.inputTokens;
              totalUsage.outputTokens += compactUsage.outputTokens;
              totalUsage.cacheCreationInputTokens += compactUsage.cacheCreationInputTokens || 0;
              totalUsage.cacheReadInputTokens += compactUsage.cacheReadInputTokens || 0;
            }
          } catch (error) {
            throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
              usage: totalUsage,
              durationMs: Date.now() - startTime,
              conversationId,
            });
          }
          // autoCompact 期间可能已被 stop：继续持久化/发送最终消息前必须重新检查
          if (signal.aborted) return;
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
        // 持久化 assistant 消息（含 tool calls）。保留对象引用（含 id），
        // 后续回写状态时按 id 直接 updateMessage，避免再整份 getMessages+scan+saveMessages。
        let persistedAssistantMessage: ChatMessage | undefined;
        if (conversationId) {
          persistedAssistantMessage = {
            id: uuidv4(),
            conversationId,
            role: "assistant",
            content: buildMessageContent(),
            thinking: result.thinking ? { content: result.thinking } : undefined,
            toolCalls: result.toolCalls,
            createtime: Date.now(),
          };
          await this.chatRepo.appendMessage(persistedAssistantMessage);
        }

        // 将 assistant 消息加入上下文（带 toolCalls，供 provider 构建 tool_calls 字段）
        messages.push({
          role: "assistant",
          content: result.content || "",
          toolCalls: result.toolCalls,
        });

        // 通过 ToolRegistry 执行工具（内置工具直接执行，脚本工具回调 Sandbox）
        // excludeTools 做后端强校验：被排除的工具名直接返回 error，避免 LLM 盲调绕过白/黑名单
        const excludeToolsSet =
          params.excludeTools && params.excludeTools.length > 0 ? new Set(params.excludeTools) : undefined;
        const toolResults = await toolRegistry.execute(result.toolCalls, scriptToolCallback, excludeToolsSet, signal);
        const cancelledDuringTools = signal.aborted;
        if (cancelledDuringTools) {
          // 取消发生在工具执行期间：toolRegistry 可能未及为所有 toolCalls 返回结果（如尚未触达的脚本工具），
          // 在此补全为 cancelled，确保下面的回写逻辑不会把任何 toolCall 遗留在 "running"
          const resultIds = new Set(toolResults.map((r) => r.id));
          for (const tc of result.toolCalls) {
            if (!resultIds.has(tc.id)) {
              toolResults.push({
                id: tc.id,
                result: JSON.stringify({ error: "Tool execution cancelled" }),
                error: true,
              });
            }
          }
        }

        // 将 tool 结果加入消息，并通知 UI 工具执行完成
        // 收集需要回写的 toolCall 元数据（执行状态 / 附件 / 子代理详情）
        const attachmentUpdates = new Map<string, Attachment[]>();
        const subAgentUpdates = new Map<string, SubAgentDetails>();
        const completedIds = new Set<string>();
        const failedIds = new Set<string>();

        for (const tr of toolResults) {
          // LLM 上下文只包含文本结果，不含附件
          messages.push({
            role: "tool",
            content: tr.result,
            toolCallId: tr.id,
          });
          // 通知 UI 工具执行完成（含附件元数据）
          sendEvent({
            type: "tool_call_complete",
            id: tr.id,
            result: tr.result,
            status: tr.error ? "error" : "completed",
            attachments: tr.attachments,
          });

          completedIds.add(tr.id);
          if (tr.error) failedIds.add(tr.id);
          if (tr.attachments?.length) {
            attachmentUpdates.set(tr.id, tr.attachments);
          }
          if (tr.subAgentDetails) {
            subAgentUpdates.set(tr.id, tr.subAgentDetails);
          }

          // 持久化 tool 结果消息
          if (conversationId) {
            await this.chatRepo.appendMessage({
              id: uuidv4(),
              conversationId,
              role: "tool",
              content: tr.result,
              toolCallId: tr.id,
              createtime: Date.now(),
            });
          }
        }

        // 回写工具执行结果到 assistant 消息的 toolCalls（内存 + 持久化）。
        // assistant 消息在执行前已落库，其 toolCalls 的 status 仍是 "running"；
        // 必须在此回写为 "completed"，否则刷新/重载会从库里读回 running，导致工具图标一直转圈。
        const applyToolUpdates = (toolCalls: ToolCall[]) => {
          for (const tc of toolCalls) {
            if (failedIds.has(tc.id)) tc.status = "error";
            else if (completedIds.has(tc.id)) tc.status = "completed";
            const atts = attachmentUpdates.get(tc.id);
            if (atts) tc.attachments = atts;
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

        // 持久化：appendMessage 时已保留了带 id 的完整对象引用，直接按 id updateMessage，
        // 不必再整份 getMessages 扫描 + saveMessages 覆写。
        if (persistedAssistantMessage?.toolCalls) {
          await this.chatRepo.updateMessage(persistedAssistantMessage);
        }

        // 工具调用状态已全部回写完毕，取消可以安全终态化了：只发一条终态事件，不再进入循环检测/下一轮
        if (cancelledDuringTools) {
          await this.emitCancelled(conversationId, totalUsage, startTime, sendEvent);
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
              const durationMs = Date.now() - startTime;
              sendEvent({ type: "done", usage: totalUsage, durationMs });
              return;
            }
            if (answer.trim().toLowerCase() === GUARD_STOP_ANSWER.toLowerCase()) {
              const durationMs = Date.now() - startTime;
              if (conversationId) {
                await this.chatRepo.appendMessage({
                  id: uuidv4(),
                  conversationId,
                  role: "assistant",
                  content: t("agent:chat_guard_stopped_message"),
                  usage: totalUsage,
                  durationMs,
                  createtime: Date.now(),
                });
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

      // 没有 tool calls，对话结束
      const durationMs = Date.now() - startTime;
      if (conversationId) {
        await this.chatRepo.appendMessage({
          id: uuidv4(),
          conversationId,
          role: "assistant",
          content: buildMessageContent(),
          thinking: result.thinking ? { content: result.thinking } : undefined,
          usage: totalUsage,
          durationMs,
          createtime: Date.now(),
        });
      }

      // 发送 done 事件
      sendEvent({ type: "done", usage: totalUsage, durationMs });
      return;
    }

    // 超过最大迭代次数
    const durationMs = Date.now() - startTime;
    const maxIterMsg = `Tool calling loop exceeded maximum iterations (${maxIterations})`;
    if (conversationId) {
      await this.chatRepo.appendMessage({
        id: uuidv4(),
        conversationId,
        role: "assistant",
        content: "",
        error: maxIterMsg,
        errorCode: "max_iterations",
        usage: totalUsage,
        durationMs,
        createtime: Date.now(),
      });
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
