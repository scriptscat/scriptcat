export type Conversation = {
  id: string;
  title: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
};

export type MessageRole = "user" | "assistant" | "system";

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
  error?: string;
  modelId?: string;
  createdAt: number;
};

// Service Worker -> UI 的流式事件（通过 MessageConnect 的 sendMessage 传输）
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
  messages: Array<{ role: MessageRole; content: string }>;
};
