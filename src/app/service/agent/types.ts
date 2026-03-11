export type Conversation = {
  id: string;
  title: string;
  modelId: string;
  system?: string;
  createdAt: number;
  updatedAt: number;
};

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  status?: "pending" | "running" | "completed" | "error";
};

export type ThinkingBlock = {
  content: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  thinking?: ThinkingBlock;
  toolCalls?: ToolCall[];
  // tool 角色的消息需要关联到对应的 tool_call
  toolCallId?: string;
  error?: string;
  modelId?: string;
  createdAt: number;
};

// Service Worker -> UI/Sandbox 的流式事件（通过 MessageConnect 的 sendMessage 传输）
export type ChatStreamEvent =
  | { type: "content_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_call_start"; toolCall: Omit<ToolCall, "result"> }
  | { type: "tool_call_delta"; id: string; delta: string }
  | { type: "done"; usage?: { inputTokens: number; outputTokens: number } }
  | { type: "error"; message: string };

// UI -> Service Worker 的聊天请求
export type ChatRequest = {
  conversationId: string;
  modelId: string;
  messages: Array<{ role: MessageRole; content: string; toolCallId?: string }>;
  tools?: ToolDefinition[];
};

// ---- CAT.agent.conversation 用户脚本 API 类型 ----

// 工具定义（用户脚本传入的格式）
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
};

// conversation.create() 的参数
export type ConversationCreateOptions = {
  id?: string;
  system?: string;
  model?: string; // modelId，不传则使用默认模型
  maxIterations?: number; // tool calling 最大循环次数，默认 20
};

// conv.chat() 的参数
export type ChatOptions = {
  tools?: Array<ToolDefinition & { handler: (args: Record<string, unknown>) => Promise<unknown> }>;
};

// conv.chat() 的返回值
export type ChatReply = {
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
};

// conv.chatStream() 的流式 chunk
export type StreamChunk = {
  type: "content_delta" | "thinking_delta" | "tool_call" | "done" | "error";
  content?: string;
  toolCall?: ToolCall;
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
};

// Sandbox -> Service Worker 的 conversation API 请求
export type ConversationApiRequest =
  | { action: "create"; options: ConversationCreateOptions; scriptUuid: string }
  | { action: "get"; id: string; scriptUuid: string }
  | {
      action: "chat";
      conversationId: string;
      message: string;
      tools?: ToolDefinition[];
      scriptUuid: string;
    }
  | { action: "getMessages"; conversationId: string; scriptUuid: string }
  | { action: "save"; conversationId: string; scriptUuid: string };
