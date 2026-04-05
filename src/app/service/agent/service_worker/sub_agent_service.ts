import { uuidv4 } from "@App/pkg/utils/uuid";
import type {
  AgentModelConfig,
  ChatRequest,
  ChatStreamEvent,
  SubAgentMessage,
} from "@App/app/service/agent/core/types";
import type { ToolRegistry } from "@App/app/service/agent/core/tool_registry";
import type { SubAgentRunOptions, SubAgentRunResult } from "@App/app/service/agent/core/tools/sub_agent";
import { resolveSubAgentType, getExcludeToolsForType } from "@App/app/service/agent/core/sub_agent_types";
import { buildSubAgentSystemPrompt } from "@App/app/service/agent/core/system_prompt";

/** 子代理上下文条目 */
interface SubAgentContextEntry {
  agentId: string;
  typeName: string;
  description: string;
  messages: ChatRequest["messages"];
  status: "completed" | "error";
  result?: string;
}

/** 供 SubAgentService 调用的 orchestrator 能力 */
export interface SubAgentOrchestrator {
  callLLMWithToolLoop(params: {
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
  // 子代理上下文缓存，按父对话 ID 分组，对话结束时清理
  private subAgentContexts = new Map<string, Map<string, SubAgentContextEntry>>();

  constructor(
    private toolRegistry: ToolRegistry,
    private orchestrator: SubAgentOrchestrator
  ) {}

  // 子代理公共编排层：处理 type 解析、resume 路由
  async runSubAgent(params: {
    options: SubAgentRunOptions;
    model: AgentModelConfig;
    parentConversationId: string;
    sendEvent: (event: ChatStreamEvent) => void;
    signal: AbortSignal;
  }): Promise<SubAgentRunResult> {
    const { options, model, parentConversationId, sendEvent, signal } = params;
    const typeConfig = resolveSubAgentType(options.type);

    // 获取所有已注册的工具名，计算排除列表
    const allToolNames = this.toolRegistry.getDefinitions().map((d) => d.name);
    const excludeTools = getExcludeToolsForType(typeConfig, allToolNames);

    // resume 模式：延续已有子代理
    if (options.to) {
      const contextMap = this.subAgentContexts.get(parentConversationId);
      const ctx = contextMap?.get(options.to);
      if (!ctx) {
        return {
          agentId: options.to,
          result: `Error: Sub-agent "${options.to}" not found. It may have been cleaned up when the conversation ended.`,
        };
      }

      // 追加新的 user message 到已有上下文
      ctx.messages.push({ role: "user", content: options.prompt });
      ctx.status = "completed"; // 重置，将由 core 更新

      const {
        result,
        details,
        usage: subUsage,
      } = await this.runSubAgentCore({
        messages: ctx.messages,
        model,
        excludeTools,
        maxIterations: typeConfig.maxIterations,
        sendEvent,
        signal,
      });

      // 更新缓存
      ctx.result = result;
      ctx.status = "completed";

      return {
        agentId: options.to,
        result,
        details: {
          agentId: options.to,
          description: ctx.description,
          subAgentType: ctx.typeName,
          messages: details,
          usage: subUsage,
        },
      };
    }

    // 新建模式
    const agentId = uuidv4();

    // 构建子代理专用 system prompt
    const availableToolNames = allToolNames.filter((n) => !new Set(excludeTools).has(n));
    const systemContent = buildSubAgentSystemPrompt(typeConfig, availableToolNames);
    const messages: ChatRequest["messages"] = [
      { role: "system", content: systemContent },
      { role: "user", content: options.prompt },
    ];

    const {
      result,
      details,
      usage: subUsage,
    } = await this.runSubAgentCore({
      messages,
      model,
      excludeTools,
      maxIterations: typeConfig.maxIterations,
      sendEvent,
      signal,
    });

    // 保存子代理上下文（用于延续）
    if (!this.subAgentContexts.has(parentConversationId)) {
      this.subAgentContexts.set(parentConversationId, new Map());
    }
    const contextMap = this.subAgentContexts.get(parentConversationId)!;
    // 限制每个对话最多缓存 10 个子代理上下文，LRU 淘汰
    if (contextMap.size >= 10) {
      const oldestKey = contextMap.keys().next().value;
      if (oldestKey) contextMap.delete(oldestKey);
    }
    contextMap.set(agentId, {
      agentId,
      typeName: typeConfig.name,
      description: options.description,
      messages,
      status: "completed",
      result,
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
      model: params.model,
      messages: params.messages,
      maxIterations: params.maxIterations,
      sendEvent: subSendEvent,
      signal: params.signal,
      scriptToolCallback: null,
      excludeTools: params.excludeTools,
      cache: false,
    });

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

  /** 清理某对话的所有子代理上下文 */
  cleanup(parentConversationId: string): void {
    this.subAgentContexts.delete(parentConversationId);
  }
}
