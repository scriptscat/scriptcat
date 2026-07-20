import type {
  AgentModelConfig,
  Attachment,
  ChatRequest,
  ChatStreamEvent,
  ContentBlock,
  SubAgentMessage,
  TokenUsage,
} from "@App/app/service/agent/core/types";
import type { ToolExecutorLike } from "@App/app/service/agent/core/tool_registry";
import type { SubAgentRunOptions, SubAgentRunResult } from "@App/app/service/agent/core/tools/sub_agent";
import { resolveSubAgentType, getExcludeToolsForType } from "@App/app/service/agent/core/sub_agent_types";
import { buildSubAgentSystemPrompt } from "@App/app/service/agent/core/system_prompt";

/** 供 SubAgentService 调用的 orchestrator 能力 */
export interface SubAgentOrchestrator {
  callLLMWithToolLoop(params: {
    toolRegistry: ToolExecutorLike;
    model: AgentModelConfig;
    messages: ChatRequest["messages"];
    maxIterations: number;
    sendEvent: (event: ChatStreamEvent) => void;
    signal: AbortSignal;
    scriptToolCallback: null;
    excludeTools?: string[];
    cache?: boolean;
    throwOnTerminalError?: boolean;
  }): Promise<void>;
}

export class SubAgentService {
  constructor(private orchestrator: SubAgentOrchestrator) {}

  // 子代理公共编排层：处理 type 解析
  // toolRegistry 由调用方传入（隔离的 childRegistry），
  // 包含子代理需要的工具（task / execute_script），不含父会话的 skill 等动态工具
  async runSubAgent(params: {
    options: SubAgentRunOptions;
    agentId: string; // 由调用方生成，确保事件路由和结果使用同一 ID
    model: AgentModelConfig;
    parentConversationId: string;
    toolRegistry: ToolExecutorLike;
    skillPromptSuffix?: string;
    sendEvent: (event: ChatStreamEvent) => void;
    signal: AbortSignal;
  }): Promise<SubAgentRunResult> {
    const { options, agentId: callerAgentId, model, toolRegistry, sendEvent, signal } = params;
    const typeConfig = resolveSubAgentType(options.type);

    // 从传入的 toolRegistry 获取可用工具名，计算排除列表（包含父会话的 session 工具）
    const allToolNames = toolRegistry.getDefinitions().map((d) => d.name);
    const excludeTools = getExcludeToolsForType(typeConfig, allToolNames);

    const agentId = callerAgentId;

    // 构建子代理专用 system prompt
    const availableToolNames = allToolNames.filter((n) => !new Set(excludeTools).has(n));
    let systemContent = buildSubAgentSystemPrompt(typeConfig, availableToolNames);
    if (params.skillPromptSuffix) {
      systemContent += "\n\n" + params.skillPromptSuffix;
    }
    // 如果父代理传递了 tab_id，在 prompt 前注入标签页上下文
    let userPrompt = options.prompt;
    if (options.tabId != null) {
      userPrompt = `[Context] Parent agent has tab_id=${options.tabId} open. Use this tab directly — do NOT open a new tab for the same page.\n\n${userPrompt}`;
    }

    const messages: ChatRequest["messages"] = [
      { role: "system", content: systemContent },
      { role: "user", content: userPrompt },
    ];

    let coreResult: Awaited<ReturnType<SubAgentService["runSubAgentCore"]>>;
    try {
      coreResult = await this.runSubAgentCore({
        toolRegistry,
        messages,
        model,
        excludeTools,
        maxIterations: typeConfig.maxIterations,
        sendEvent,
        signal,
      });
    } catch (error) {
      const terminalError = error instanceof Error ? error : new Error(String(error));
      const partial = terminalError as Error & {
        details?: SubAgentMessage[];
        usage?: TokenUsage;
        attachments?: Attachment[];
        ownedAttachmentIds?: string[];
      };
      (terminalError as Error & { subAgentDetails?: NonNullable<SubAgentRunResult["details"]> }).subAgentDetails = {
        agentId,
        description: options.description,
        subAgentType: typeConfig.name,
        messages: partial.details || [],
        usage: partial.usage,
      };
      throw terminalError;
    }

    const { result, details, usage: subUsage, attachments, ownedAttachmentIds } = coreResult;

    return {
      agentId,
      result,
      details: {
        agentId,
        description: options.description,
        subAgentType: typeConfig.name,
        messages: details,
        usage: subUsage,
      },
      usage: subUsage,
      attachments,
      ownedAttachmentIds,
    };
  }

  // 子代理核心执行层
  private async runSubAgentCore(params: {
    toolRegistry: ToolExecutorLike;
    messages: ChatRequest["messages"];
    model: AgentModelConfig;
    excludeTools: string[];
    maxIterations: number;
    sendEvent: (event: ChatStreamEvent) => void;
    signal: AbortSignal;
  }): Promise<{
    result: string;
    details: SubAgentMessage[];
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheCreationInputTokens: number;
      cacheReadInputTokens: number;
    };
    attachments: Attachment[];
    ownedAttachmentIds: string[];
  }> {
    let resultContent = "";
    // 收集子代理执行详情用于持久化
    const details: SubAgentMessage[] = [];
    let currentMsg: SubAgentMessage = { content: "", toolCalls: [] };
    let currentText = "";
    let currentBlocks: ContentBlock[] = [];
    const generatedAttachments: Attachment[] = [];
    const ownedAttachmentIds = new Set<string>();
    const updateCurrentContent = () => {
      currentMsg.content = currentBlocks.length
        ? [...(currentText ? [{ type: "text" as const, text: currentText }] : []), ...currentBlocks]
        : currentText;
    };
    const hasCurrentMessage = () =>
      currentText.length > 0 ||
      currentBlocks.length > 0 ||
      Boolean(currentMsg.thinking) ||
      Boolean(currentMsg.warning) ||
      currentMsg.toolCalls.length > 0;
    // 累计 usage
    const subUsage = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
    // 是否已通过 sendEvent 转发过终态（done/error）。orchestrator 在 callLLM/autoCompact
    // 原生失败时只 throw、不 sendEvent，若不补发，实时 UI 收不到子代理的终态事件，会一直显示 running。
    let terminalEventEmitted = false;

    const subSendEvent = (event: ChatStreamEvent) => {
      // 转发事件给父代理
      params.sendEvent(event);
      // 收集执行详情
      switch (event.type) {
        case "content_delta":
          resultContent += event.delta;
          currentText += event.delta;
          updateCurrentContent();
          break;
        case "content_block_complete": {
          currentBlocks.push(event.block);
          updateCurrentContent();
          generatedAttachments.push({
            id: event.block.attachmentId,
            type: event.block.type,
            name: event.block.name || event.block.attachmentId,
            mimeType: event.block.mimeType,
            size: "size" in event.block ? event.block.size : undefined,
          });
          ownedAttachmentIds.add(event.block.attachmentId);
          const reference = `[Generated ${event.block.type}: uploads/${event.block.attachmentId}]`;
          resultContent += resultContent ? `\n\n${reference}` : reference;
          break;
        }
        case "thinking_delta":
          currentMsg.thinking = (currentMsg.thinking || "") + event.delta;
          break;
        case "system_warning":
          // 生成数据丢失等警告（如图片保存失败）需随当前轮次一起归档，否则子代理详情持久化
          // 后刷新页面就丢失了这条提示——与父级 assistant 消息的 warning 字段同样的语义
          currentMsg.warning = currentMsg.warning ? `${currentMsg.warning}\n${event.message}` : event.message;
          break;
        case "tool_call_start":
          currentMsg.toolCalls.push({
            ...event.toolCall,
            arguments: event.toolCall.arguments || "",
            status: "running",
          });
          break;
        case "tool_call_delta": {
          if (!currentMsg.toolCalls.length) break;
          let t = event.id ? currentMsg.toolCalls.find((x) => x.id === event.id) : undefined;
          if (!t && event.index !== undefined) t = currentMsg.toolCalls[event.index];
          if (!t) {
            for (let i = currentMsg.toolCalls.length - 1; i >= 0; i--) {
              if (currentMsg.toolCalls[i].status === "running") {
                t = currentMsg.toolCalls[i];
                break;
              }
            }
          }
          if (t) t.arguments += event.delta;
          break;
        }
        case "tool_call_complete": {
          const tc = currentMsg.toolCalls.find((t) => t.id === event.id);
          if (tc) {
            tc.status = event.status ?? "completed";
            tc.result = event.result;
            tc.attachments = event.attachments;
            tc.ownedAttachmentIds = event.ownedAttachmentIds;
            for (const id of event.ownedAttachmentIds || []) ownedAttachmentIds.add(id);
          }
          break;
        }
        case "new_message":
          // 新一轮开始，归档当前消息
          resultContent = "";
          if (hasCurrentMessage()) {
            details.push(currentMsg);
          }
          currentMsg = { content: "", toolCalls: [] };
          currentText = "";
          currentBlocks = [];
          break;
        case "done":
        case "error":
          terminalEventEmitted = true;
          if (event.usage) {
            subUsage.inputTokens += event.usage.inputTokens;
            subUsage.outputTokens += event.usage.outputTokens;
            subUsage.cacheCreationInputTokens += event.usage.cacheCreationInputTokens || 0;
            subUsage.cacheReadInputTokens += event.usage.cacheReadInputTokens || 0;
          }
          break;
      }
    };

    try {
      await this.orchestrator.callLLMWithToolLoop({
        toolRegistry: params.toolRegistry,
        model: params.model,
        messages: params.messages,
        maxIterations: params.maxIterations,
        sendEvent: subSendEvent,
        signal: params.signal,
        scriptToolCallback: null,
        excludeTools: params.excludeTools,
        cache: false,
        throwOnTerminalError: true,
      });
    } catch (error) {
      const terminalError = error instanceof Error ? error : new Error(String(error));
      if (hasCurrentMessage()) {
        details.push(currentMsg);
      }
      const terminalUsage = (terminalError as Error & { usage?: TokenUsage }).usage;
      if (terminalUsage) Object.assign(subUsage, terminalUsage);
      // orchestrator 的 callLLM/autoCompact 原生失败只 throw、不 sendEvent 终态；
      // 若不在此补发一次，实时 UI（依赖 subAgent 元信息的 done/error 事件）会一直显示 running。
      if (!terminalEventEmitted) {
        const errorLike = terminalError as Error & { errorCode?: string; durationMs?: number };
        params.sendEvent({
          type: "error",
          message: terminalError.message,
          errorCode: errorLike.errorCode,
          usage: subUsage,
          durationMs: errorLike.durationMs,
        });
      }
      Object.assign(terminalError, {
        details,
        usage: subUsage,
        attachments: generatedAttachments,
        ownedAttachmentIds: [...ownedAttachmentIds],
      });
      throw terminalError;
    }

    // 检查是否因超时中止（区分用户主动取消和超时）
    const abortReason = params.signal.reason;
    const isTimeout = abortReason instanceof DOMException && abortReason.name === "TimeoutError";
    if (params.signal.aborted && isTimeout) {
      resultContent += resultContent
        ? "\n\n[Sub-agent timed out. The results above may be incomplete.]"
        : "[Sub-agent timed out before producing any output.]";
    }

    // 归档最后一轮消息
    if (hasCurrentMessage()) {
      details.push(currentMsg);
    }

    // 父会话 Stop 与超时策略不同：超时允许把已有结果作为部分成功返回；用户取消必须让
    // 父工具调用持久化为 error，不能在实时流已显示 cancelled 后又提交 completed。
    if (params.signal.aborted && !isTimeout) {
      throw Object.assign(new Error("Aborted"), {
        details,
        usage: subUsage,
        attachments: generatedAttachments,
        ownedAttachmentIds: [...ownedAttachmentIds],
      });
    }

    const attachmentReferences = generatedAttachments.map(
      (attachment) => `[Generated ${attachment.type}: uploads/${attachment.id}]`
    );
    const missingReferences = attachmentReferences.filter((reference) => !resultContent.includes(reference));
    const finalResult = [resultContent, ...missingReferences].filter(Boolean).join("\n\n");

    return {
      result: finalResult || "(sub-agent produced no output)",
      details,
      usage: subUsage,
      attachments: generatedAttachments,
      ownedAttachmentIds: [...ownedAttachmentIds],
    };
  }

  /** 清理某对话的资源（预留扩展点） */
  cleanup(_parentConversationId: string): void {
    // 当前无需清理，保留接口供后续扩展
  }
}
