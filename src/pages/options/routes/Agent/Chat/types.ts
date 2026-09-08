import type { ContentBlock, SubAgentMessage, ToolCall, TokenUsage } from "@App/app/service/agent/core/types";

export type { SubAgentMessage };

/** 子代理完整状态（流式期间维护，渲染时消费） */
export type SubAgentState = {
  agentId: string;
  description: string;
  subAgentType?: string;
  /** 发起该子代理的 agent 工具调用 ID，用于并发调用时的显式匹配（而非猜测第一个运行中的子代理） */
  toolCallId?: string;
  /** 已完成的消息轮次 */
  completedMessages: SubAgentMessage[];
  /** 当前正在构建的消息内容 */
  currentContent: string;
  currentBlocks?: ContentBlock[];
  currentThinking: string;
  currentToolCalls: ToolCall[];
  currentWarning?: string;
  isRunning: boolean;
  /** 重试信息 */
  retryInfo?: { attempt: number; maxRetries: number; error: string };
  /** token 用量 */
  usage?: TokenUsage;
};
