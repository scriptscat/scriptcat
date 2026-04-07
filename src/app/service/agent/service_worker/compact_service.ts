import type { AgentChatRepo } from "@App/app/repo/agent_chat";
import type {
  AgentModelConfig,
  ChatRequest,
  ChatStreamEvent,
  ToolCall,
  ContentBlock,
  ToolDefinition,
} from "@App/app/service/agent/core/types";
import {
  COMPACT_SYSTEM_PROMPT,
  buildCompactUserPrompt,
  extractSummary,
} from "@App/app/service/agent/core/compact_prompt";
import { uuidv4 } from "@App/pkg/utils/uuid";
import type { AgentModelService } from "./model_service";

/** LLM 调用结果（与 AgentService.callLLM 返回值一致） */
interface CompactLLMResult {
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  contentBlocks?: ContentBlock[];
}

/** 供 CompactService 调用的 orchestrator 能力（最小 LLM 调用接口） */
export interface CompactOrchestrator {
  callLLM(
    model: AgentModelConfig,
    params: { messages: ChatRequest["messages"]; tools?: ToolDefinition[]; cache?: boolean },
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<CompactLLMResult>;
}

export class CompactService {
  constructor(
    private modelService: AgentModelService,
    private orchestrator: CompactOrchestrator,
    private chatRepo: AgentChatRepo
  ) {}

  /** 自动 compact：汇总对话历史为 summary 并替换 currentMessages */
  async autoCompact(
    conversationId: string,
    model: AgentModelConfig,
    currentMessages: ChatRequest["messages"],
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<void> {
    // 构建摘要请求（用 currentMessages 而非从 repo 加载，因为可能有未持久化的 tool 消息）
    const summaryMessages: ChatRequest["messages"] = [];
    summaryMessages.push({ role: "system", content: COMPACT_SYSTEM_PROMPT });

    for (const msg of currentMessages) {
      if (msg.role === "system") continue;
      summaryMessages.push(msg);
    }
    summaryMessages.push({ role: "user", content: buildCompactUserPrompt() });

    // 调用 LLM 获取摘要（不带 tools，不发流式事件给 UI）
    const noopSendEvent = () => {};
    const result = await this.orchestrator.callLLM(
      model,
      { messages: summaryMessages, cache: false },
      noopSendEvent,
      signal
    );

    const summary = extractSummary(result.content);

    // 替换 currentMessages（保留 system，替换其余为摘要）
    const systemMsg = currentMessages.find((m) => m.role === "system");
    currentMessages.length = 0;
    if (systemMsg) currentMessages.push(systemMsg);
    currentMessages.push({ role: "user", content: `[Conversation Summary]\n\n${summary}` });

    // 持久化
    const summaryMessage = {
      id: uuidv4(),
      conversationId,
      role: "user" as const,
      content: `[Conversation Summary]\n\n${summary}`,
      createtime: Date.now(),
    };
    await this.chatRepo.saveMessages(conversationId, [summaryMessage]);

    // 通知 UI
    sendEvent({ type: "compact_done", summary, originalCount: -1 });
  }

  /** 使用 summary 模型对任意内容做提取/总结（供 tab 工具使用） */
  async summarizeContent(content: string, prompt: string): Promise<string> {
    const model = await this.modelService.getSummaryModel();

    const messages: ChatRequest["messages"] = [
      {
        role: "system" as const,
        content:
          "Extract or summarize the relevant information from the provided web page content based on the user's request. Return only the relevant content without any explanation or commentary.",
      },
      {
        role: "user" as const,
        content: `${prompt}\n\n---\n\n${content}`,
      },
    ];

    const noopSendEvent = () => {};
    const controller = new AbortController();
    try {
      const result = await this.orchestrator.callLLM(
        model,
        { messages, cache: false },
        noopSendEvent,
        controller.signal
      );
      return result.content;
    } catch (e: any) {
      throw new Error(`Summarization failed: ${e.message}`);
    }
  }
}
