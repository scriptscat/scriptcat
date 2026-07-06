import type { AgentChatRepo } from "@App/app/repo/agent_chat";
import type { ScriptToolCallback, ToolExecutorLike } from "@App/app/service/agent/core/tool_registry";
import type {
  AgentModelConfig,
  ChatRequest,
  ChatStreamEvent,
  ToolDefinition,
  ToolCall,
  Attachment,
  SubAgentDetails,
  ContentBlock,
  MessageContent,
} from "@App/app/service/agent/core/types";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { getContextWindow } from "@App/app/service/agent/core/model_context";
import { detectToolCallIssues, type ToolCallRecord } from "@App/app/service/agent/core/tool_call_guard";
import { elideOldToolResults } from "@App/app/service/agent/core/context_elision";
import type { LLMCallResult } from "./llm_client";

// 上下文占用达到这些比例时，分批裁剪保留窗口外的旧 tool 结果（早于 autoCompact 的 80% 阈值）。
// 按阈值分批触发而非逐轮触发，避免每轮都重写消息前缀导致 Anthropic 的 prompt cache 断点失效。
const ELISION_THRESHOLDS = [0.4, 0.6];
// 保留最近几轮 assistant(带 toolCalls) 及其 tool 结果的完整原文，更早的轮次被裁剪为占位文本
const ELISION_KEEP_LAST_ASSISTANT_TURNS = 5;

// 循环检测（tool_call_guard）连续命中达到此次数时，暂停并询问用户是否继续（仅当调用方提供 askUserForGuard 时生效）
const GUARD_ESCALATION_STRIKES = 2;
const GUARD_STOP_ANSWER = "Stop";

/** ToolLoopOrchestrator 所需的外部依赖（由 AgentService 注入） */
export interface ToolLoopDeps {
  // callLLM 通过 lambda 注入，确保测试 spy 可以拦截
  callLLM(
    model: AgentModelConfig,
    params: { messages: ChatRequest["messages"]; tools?: ToolDefinition[]; cache?: boolean },
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<LLMCallResult>;
  autoCompact(
    conversationId: string,
    model: AgentModelConfig,
    messages: ChatRequest["messages"],
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<void>;
}

export class ToolLoopOrchestrator {
  // 注意：不在构造器持有 toolRegistry。
  // 每次 callLLMWithToolLoop 由调用方传入（通常是 SessionToolRegistry），
  // 保证并发会话各自使用独立的工具注册表，避免闭包互相覆盖。
  constructor(
    private deps: ToolLoopDeps,
    private chatRepo: AgentChatRepo
  ) {}

  // 统一的 tool calling 循环，UI 和脚本共用
  async callLLMWithToolLoop(params: {
    // 本次调用使用的工具注册表（SessionToolRegistry 或 ToolRegistry）
    toolRegistry: ToolExecutorLike;
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
    // 跳过内置工具，仅使用传入的 tools（ephemeral 模式）
    skipBuiltinTools?: boolean;
    // 排除的工具名称列表（子代理不可用 ask_user、agent）
    excludeTools?: string[];
    // 是否启用 prompt caching，默认 true
    cache?: boolean;
    // 循环检测连续命中达到 GUARD_ESCALATION_STRIKES 次时调用，暂停循环询问用户是否继续。
    // 仅由 UI 对话（含后台会话）传入；定时任务、子代理不传，保持原有的仅告警不暂停行为。
    askUserForGuard?: (question: string, options: string[]) => Promise<string>;
  }): Promise<void> {
    const {
      toolRegistry,
      model,
      messages,
      tools,
      maxIterations,
      sendEvent,
      signal,
      scriptToolCallback,
      conversationId,
    } = params;

    const startTime = Date.now();
    let iterations = 0;
    const totalUsage = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
    const toolCallHistory: ToolCallRecord[] = [];
    let guardStartIndex = 0;
    // 已触发过的裁剪阈值下标（-1 表示尚未触发过），避免同一阈值区间内每轮重复裁剪
    let lastElisionThresholdIndex = -1;
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

      // 调用 LLM（重试由 llm_client 内部处理）
      const result = await this.deps.callLLM(
        model,
        { messages, tools: allToolDefs.length > 0 ? allToolDefs : undefined, cache: params.cache },
        sendEvent,
        signal
      );

      if (signal.aborted) return;

      // 累计 usage
      if (result.usage) {
        totalUsage.inputTokens += result.usage.inputTokens;
        totalUsage.outputTokens += result.usage.outputTokens;
        totalUsage.cacheCreationInputTokens += result.usage.cacheCreationInputTokens || 0;
        totalUsage.cacheReadInputTokens += result.usage.cacheReadInputTokens || 0;
      }

      // 自动 compact：当上下文占用超过 80% 时触发；否则按阈值分批裁剪旧 tool 结果（见下方 pendingElision）
      let pendingElision = false;
      if (result.usage && conversationId) {
        const contextWindow = getContextWindow(model);
        const usageRatio = result.usage.inputTokens / contextWindow;

        if (usageRatio >= 0.8) {
          await this.deps.autoCompact(conversationId, model, messages, sendEvent, signal);
        } else {
          for (let i = 0; i < ELISION_THRESHOLDS.length; i++) {
            if (i > lastElisionThresholdIndex && usageRatio >= ELISION_THRESHOLDS[i]) {
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
        // 持久化 assistant 消息（含 tool calls）
        if (conversationId) {
          await this.chatRepo.appendMessage({
            id: uuidv4(),
            conversationId,
            role: "assistant",
            content: buildMessageContent(),
            thinking: result.thinking ? { content: result.thinking } : undefined,
            toolCalls: result.toolCalls,
            createtime: Date.now(),
          });
        }

        // 将 assistant 消息加入上下文（带 toolCalls，供 provider 构建 tool_calls 字段）
        messages.push({ role: "assistant", content: result.content || "", toolCalls: result.toolCalls });

        // 通过 ToolRegistry 执行工具（内置工具直接执行，脚本工具回调 Sandbox）
        // excludeTools 做后端强校验：被排除的工具名直接返回 error，避免 LLM 盲调绕过白/黑名单
        const excludeToolsSet =
          params.excludeTools && params.excludeTools.length > 0 ? new Set(params.excludeTools) : undefined;
        const toolResults = await toolRegistry.execute(result.toolCalls, scriptToolCallback, excludeToolsSet);

        // 将 tool 结果加入消息，并通知 UI 工具执行完成
        // 收集需要回写的 toolCall 元数据（执行状态 / 附件 / 子代理详情）
        const attachmentUpdates = new Map<string, Attachment[]>();
        const subAgentUpdates = new Map<string, SubAgentDetails>();
        const completedIds = new Set<string>();

        for (const tr of toolResults) {
          // LLM 上下文只包含文本结果，不含附件
          messages.push({ role: "tool", content: tr.result, toolCallId: tr.id });
          // 通知 UI 工具执行完成（含附件元数据）
          sendEvent({ type: "tool_call_complete", id: tr.id, result: tr.result, attachments: tr.attachments });

          completedIds.add(tr.id);
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
            if (completedIds.has(tc.id)) tc.status = "completed";
            const atts = attachmentUpdates.get(tc.id);
            if (atts) tc.attachments = atts;
            const sad = subAgentUpdates.get(tc.id);
            if (sad) tc.subAgentDetails = sad;
          }
        };

        // 内存上下文中的 assistant 消息
        const assistantMsg = messages.find(
          (m) => m.role === "assistant" && m.toolCalls?.some((tc: ToolCall) => completedIds.has(tc.id))
        );
        if (assistantMsg?.toolCalls) applyToolUpdates(assistantMsg.toolCalls);

        // 持久化的 assistant 消息
        if (conversationId) {
          const allMessages = await this.chatRepo.getMessages(conversationId);
          for (let i = allMessages.length - 1; i >= 0; i--) {
            const msg = allMessages[i];
            if (msg.role === "assistant" && msg.toolCalls?.some((tc: ToolCall) => completedIds.has(tc.id))) {
              applyToolUpdates(msg.toolCalls!);
              await this.chatRepo.saveMessages(conversationId, allMessages);
              break;
            }
          }
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
            const answer = await params.askUserForGuard(
              `[System] The Agent has triggered the loop-guard warning ${guardStrikeCount} times in this run. Continue letting it proceed automatically, or stop here?`,
              ["Continue", GUARD_STOP_ANSWER]
            );
            if (answer.trim().toLowerCase() === GUARD_STOP_ANSWER.toLowerCase()) {
              const durationMs = Date.now() - startTime;
              if (conversationId) {
                await this.chatRepo.appendMessage({
                  id: uuidv4(),
                  conversationId,
                  role: "assistant",
                  content: "Stopped at the user's request after repeated loop-guard warnings.",
                  usage: totalUsage,
                  durationMs,
                  createtime: Date.now(),
                });
              }
              sendEvent({ type: "done", usage: totalUsage, durationMs });
              return;
            }
          }
        }

        // 分批裁剪：待本轮 assistant/tool 消息入列后再裁剪，让本轮内容计入"最近 K 轮"窗口
        if (pendingElision) {
          elideOldToolResults(messages, ELISION_KEEP_LAST_ASSISTANT_TURNS);
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
    const maxIterMsg = `Tool calling loop exceeded maximum iterations (${maxIterations})`;
    if (conversationId) {
      await this.chatRepo.appendMessage({
        id: uuidv4(),
        conversationId,
        role: "assistant",
        content: "",
        error: maxIterMsg,
        errorCode: "max_iterations",
        createtime: Date.now(),
      });
    }
    sendEvent({
      type: "error",
      message: maxIterMsg,
      errorCode: "max_iterations",
    });
  }
}
