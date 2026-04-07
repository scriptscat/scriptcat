import type {
  AgentModelConfig,
  ChatRequest,
  ChatStreamEvent,
  SubAgentMessage,
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

    const {
      result,
      details,
      usage: subUsage,
    } = await this.runSubAgentCore({
      toolRegistry,
      messages,
      model,
      excludeTools,
      maxIterations: typeConfig.maxIterations,
      sendEvent,
      signal,
    });

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
  }> {
    let resultContent = "";
    // 收集子代理执行详情用于持久化
    const details: SubAgentMessage[] = [];
    let currentMsg: SubAgentMessage = { content: "", toolCalls: [] };
    // 累计 usage
    const subUsage = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };

    const subSendEvent = (event: ChatStreamEvent) => {
      // 转发事件给父代理
      params.sendEvent(event);
      // 收集执行详情
      switch (event.type) {
        case "content_delta":
          resultContent += event.delta;
          currentMsg.content += event.delta;
          break;
        case "thinking_delta":
          currentMsg.thinking = (currentMsg.thinking || "") + event.delta;
          break;
        case "tool_call_start":
          currentMsg.toolCalls.push({
            ...event.toolCall,
            arguments: event.toolCall.arguments || "",
            status: "running",
          });
          break;
        case "tool_call_delta":
          if (currentMsg.toolCalls.length) {
            currentMsg.toolCalls[currentMsg.toolCalls.length - 1].arguments += event.delta;
          }
          break;
        case "tool_call_complete": {
          const tc = currentMsg.toolCalls.find((t) => t.id === event.id);
          if (tc) {
            tc.status = "completed";
            tc.result = event.result;
            tc.attachments = event.attachments;
          }
          break;
        }
        case "new_message":
          // 新一轮开始，归档当前消息
          resultContent = "";
          if (currentMsg.content || currentMsg.thinking || currentMsg.toolCalls.length > 0) {
            details.push(currentMsg);
          }
          currentMsg = { content: "", toolCalls: [] };
          break;
        case "done":
          if (event.usage) {
            subUsage.inputTokens += event.usage.inputTokens;
            subUsage.outputTokens += event.usage.outputTokens;
            subUsage.cacheCreationInputTokens += event.usage.cacheCreationInputTokens || 0;
            subUsage.cacheReadInputTokens += event.usage.cacheReadInputTokens || 0;
          }
          break;
      }
    };

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
    });

    // 检查是否因超时中止（区分用户主动取消和超时）
    if (params.signal.aborted) {
      const reason = params.signal.reason;
      const isTimeout = reason instanceof DOMException && reason.name === "TimeoutError";
      if (isTimeout) {
        resultContent += resultContent
          ? "\n\n[Sub-agent timed out. The results above may be incomplete.]"
          : "[Sub-agent timed out before producing any output.]";
      }
    }

    // 归档最后一轮消息
    if (currentMsg.content || currentMsg.thinking || currentMsg.toolCalls.length > 0) {
      details.push(currentMsg);
    }

    return {
      result: resultContent || "(sub-agent produced no output)",
      details,
      usage: subUsage,
    };
  }

  /** 清理某对话的资源（预留扩展点） */
  cleanup(_parentConversationId: string): void {
    // 当前无需清理，保留接口供后续扩展
  }
}
