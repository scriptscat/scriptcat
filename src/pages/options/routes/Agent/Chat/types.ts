import type { SubAgentMessage, ToolCall, TokenUsage } from "@App/app/service/agent/core/types";

export type { SubAgentMessage };

/** 子代理完整状态（流式期间维护，渲染时消费） */
export type SubAgentState = {
  agentId: string;
  description: string;
  subAgentType?: string;
  /** 已完成的消息轮次 */
  completedMessages: SubAgentMessage[];
  /** 当前正在构建的消息内容 */
  currentContent: string;
  currentThinking: string;
  currentToolCalls: ToolCall[];
  isRunning: boolean;
  /** 重试信息 */
  retryInfo?: { attempt: number; maxRetries: number; error: string };
  /** token 用量 */
  usage?: TokenUsage;
};
