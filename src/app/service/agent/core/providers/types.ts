import type { AgentModelConfig, ChatRequest, ChatStreamEvent } from "../types";

/** 构建 HTTP 请求所需的输入参数 */
export interface ProviderBuildRequestInput {
  /** 模型配置 */
  model: AgentModelConfig;
  /** LLM 聊天请求 */
  request: ChatRequest;
  /** 附件 ID → base64 data URL 解析器 */
  resolver?: (attachmentId: string) => string | null;
}

/** 构建 HTTP 请求的输出 */
export interface ProviderBuildRequestOutput {
  url: string;
  init: RequestInit;
}

/** 流式事件推送回调 */
export type ProviderStreamEventHandler = (event: ChatStreamEvent) => void;

/**
 * LLM Provider 抽象接口。
 * 每个 Provider 实现此接口后注册到 providerRegistry，callLLM 通过注册表查找。
 */
export interface LLMProvider {
  /** Provider 标识名，用于注册与查找（如 "openai"、"anthropic"） */
  readonly name: string;

  /** 构建 fetch 请求所需的 url 与 RequestInit */
  buildRequest(input: ProviderBuildRequestInput): ProviderBuildRequestOutput | Promise<ProviderBuildRequestOutput>;

  /** 解析 SSE 流式响应，通过 onEvent 推送 ChatStreamEvent */
  parseStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onEvent: ProviderStreamEventHandler,
    signal: AbortSignal
  ): Promise<void>;
}
