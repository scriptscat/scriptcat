// ---- 通用类型 ----

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** LLM 调用的 token 用量统计 */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
};

// ---- ContentBlock 多模态内容类型 ----

export type TextBlock = { type: "text"; text: string };
export type ImageBlock = { type: "image"; attachmentId: string; mimeType: string; name?: string };
export type FileBlock = { type: "file"; attachmentId: string; mimeType: string; name: string; size?: number };
export type AudioBlock = { type: "audio"; attachmentId: string; mimeType: string; name?: string; durationMs?: number };

export type ContentBlock = TextBlock | ImageBlock | FileBlock | AudioBlock;
export type MessageContent = string | ContentBlock[];

export type Conversation = {
  id: string;
  title: string;
  modelId: string;
  system?: string;
  skills?: "auto" | string[];
  enableTools?: boolean; // 是否携带 tools，默认 true；图片生成模型需关闭
  createtime: number;
  updatetime: number;
};

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type Attachment = {
  id: string;
  type: "image" | "file" | "audio";
  name: string; // 文件名
  mimeType: string; // "image/jpeg", "application/zip" 等
  size?: number; // 字节数
  // 数据不内联存储，通过 id 从 OPFS 加载
};

export type AttachmentData = {
  type: "image" | "file" | "audio";
  name: string;
  mimeType: string;
  data: string | Blob; // base64/data URL 或 Blob
};

export type ToolResultWithAttachments = {
  content: string; // 文本结果（发给 LLM）
  attachments: AttachmentData[]; // 附件数据（仅存储+展示）
};

// 子代理单轮消息（持久化用）
export type SubAgentMessage = {
  content: string;
  thinking?: string;
  toolCalls: ToolCall[];
};

// 子代理执行详情（持久化到 ToolCall）
export type SubAgentDetails = {
  agentId: string;
  description: string;
  subAgentType?: string;
  messages: SubAgentMessage[];
  usage?: TokenUsage;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  attachments?: Attachment[];
  subAgentDetails?: SubAgentDetails;
  status?: "pending" | "running" | "completed" | "error";
};

export type ThinkingBlock = {
  content: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: MessageContent;
  thinking?: ThinkingBlock;
  toolCalls?: ToolCall[];
  // tool 角色的消息需要关联到对应的 tool_call
  toolCallId?: string;
  error?: string;
  warning?: string;
  modelId?: string;
  usage?: TokenUsage;
  durationMs?: number;
  firstTokenMs?: number;
  parentId?: string;
  createtime: number;
};

// ---- 流式事件分类 ----

// 子代理元信息（附加在子代理转发的事件上）
export type SubAgentEventInfo = {
  agentId: string;
  description: string;
  subAgentType?: string;
};

// LLM 流式输出事件
export type LLMStreamEvent =
  | { type: "content_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_call_start"; toolCall: Omit<ToolCall, "result"> }
  | { type: "tool_call_delta"; id: string; delta: string }
  | { type: "tool_call_complete"; id: string; result: string; attachments?: Attachment[] }
  | { type: "content_block_start"; block: Omit<ImageBlock | FileBlock | AudioBlock, "attachmentId"> }
  | { type: "content_block_complete"; block: ImageBlock | FileBlock | AudioBlock; data?: string };

// 可被子代理转发的事件（LLM 流式 + 生命周期），非递归
export type ForwardableEvent =
  | LLMStreamEvent
  | { type: "new_message" }
  | {
      type: "done";
      usage?: {
        inputTokens: number;
        outputTokens: number;
        cacheCreationInputTokens?: number;
        cacheReadInputTokens?: number;
      };
      durationMs?: number;
    }
  | { type: "error"; message: string; errorCode?: string }
  | { type: "retry"; attempt: number; maxRetries: number; error: string; delayMs: number };

// Service Worker -> UI/Sandbox 的流式事件（通过 MessageConnect 的 sendMessage 传输）
// ForwardableEvent 携带可选 subAgent 标识（扁平化子代理事件，消除递归包装）
export type ChatStreamEvent =
  | (ForwardableEvent & { subAgent?: SubAgentEventInfo })
  | { type: "ask_user"; id: string; question: string; options?: string[]; multiple?: boolean }
  | { type: "system_warning"; message: string }
  | {
      type: "task_update";
      tasks: Array<{
        id: string;
        subject: string;
        status: "pending" | "in_progress" | "completed";
        description?: string;
      }>;
    }
  | { type: "compact_done"; summary: string; originalCount: number }
  | {
      type: "sync";
      streamingMessage?: { content: string; thinking?: string; toolCalls: ToolCall[] };
      pendingAskUser?: { id: string; question: string; options?: string[]; multiple?: boolean };
      tasks: Array<{
        id: string;
        subject: string;
        status: "pending" | "in_progress" | "completed";
        description?: string;
      }>;
      status: "running" | "done" | "error";
    };

// UI -> Service Worker 的聊天请求
export type ChatRequest = {
  conversationId: string;
  modelId: string;
  messages: Array<{ role: MessageRole; content: MessageContent; toolCallId?: string; toolCalls?: ToolCall[] }>;
  tools?: ToolDefinition[];
  cache?: boolean; // 是否启用 prompt caching（Anthropic），默认 true。短对话（如子 agent）可关闭以节省开销
};

// ---- Agent 模型配置 ----

export type AgentModelConfig = {
  id: string; // 唯一标识
  name: string; // 用户自定义名称（如 "GPT-4o", "Claude Sonnet"）
  provider: "openai" | "anthropic" | "zhipu";
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number; // 最大输出 token 数，不设置则由 API 端决定
  contextWindow?: number; // 最大上下文 token 数（输入+输出），如 128000、200000
  availableModels?: string[]; // 缓存从 API 获取的可用模型列表
  supportsVision?: boolean; // 用户手动标记是否支持视觉输入
  supportsImageOutput?: boolean; // 用户手动标记是否支持图片输出
};

// 隐藏 apiKey 的安全版模型配置，暴露给用户脚本
export type AgentModelSafeConfig = Omit<AgentModelConfig, "apiKey">;

// CAT.agent.model API 请求
export type ModelApiRequest =
  | { action: "list"; scriptUuid: string }
  | { action: "get"; id: string; scriptUuid: string }
  | { action: "getDefault"; scriptUuid: string }
  | { action: "getSummary"; scriptUuid: string };

// ---- CAT.agent.conversation 用户脚本 API 类型 ----

// 工具定义（用户脚本传入的格式）
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
};

// 命令处理器类型
export type CommandHandler = (args: string, conv: any) => Promise<string | void>;

// conversation.create() 的参数
export type ConversationCreateOptions = {
  id?: string;
  system?: string;
  model?: string; // modelId，不传则使用默认模型
  maxIterations?: number; // tool calling 最大循环次数，默认 20
  skills?: "auto" | string[]; // 加载的 Skill，"auto" 加载全部，数组指定名称
  tools?: Array<ToolDefinition & { handler: (args: Record<string, unknown>) => Promise<unknown> }>;
  commands?: Record<string, CommandHandler>; // 自定义命令处理器，以 / 开头
  ephemeral?: boolean; // 临时会话：不持久化、不加载内置资源、工具由脚本提供
  cache?: boolean; // 是否启用 prompt caching，默认 true
  background?: boolean; // 后台运行：UI 断开后继续执行，默认 false
};

// conv.chat() 的参数
export type ChatOptions = {
  tools?: Array<ToolDefinition & { handler: (args: Record<string, unknown>) => Promise<unknown> }>;
};

// conv.chat() 的返回值
export type ChatReply = {
  content: MessageContent;
  thinking?: string;
  toolCalls?: ToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  command?: boolean; // 标识该回复来自命令处理
};

// conv.chatStream() 的流式 chunk
export type StreamChunk = {
  type: "content_delta" | "thinking_delta" | "tool_call" | "content_block" | "done" | "error";
  content?: string;
  block?: ContentBlock;
  toolCall?: ToolCall;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  error?: string;
  /** 错误分类码："rate_limit" | "auth" | "tool_timeout" | "max_iterations" | "api_error" */
  errorCode?: string;
  command?: boolean; // 标识该 chunk 来自命令处理
};

// ---- Skill 类型 ----

// Skill config 字段定义（SKILL.md frontmatter 中声明）
export type SkillConfigField = {
  title: string;
  type: "text" | "number" | "select" | "switch";
  secret?: boolean;
  required?: boolean;
  default?: unknown;
  values?: string[]; // select 类型的选项列表
};

// Skill 摘要（registry.json 中）
export type SkillSummary = {
  name: string;
  description: string;
  version?: string; // 语义化版本号
  toolNames: string[]; // 随 Skill 打包的脚本名称（scripts/ 目录下）
  referenceNames: string[]; // 参考资料名称（references/ 目录下）
  hasConfig?: boolean; // 是否有 config 字段声明
  enabled?: boolean; // 是否启用，默认 true（undefined 视为 true）
  installUrl?: string; // 安装来源 URL（用于检查更新）
  installtime: number;
  updatetime: number;
};

// SKILL.cat.md frontmatter 解析结果
export type SkillMetadata = {
  name: string;
  description: string;
  version?: string; // 语义化版本号
  scripts?: string[]; // 脚本文件名列表（URL 安装时按相对路径获取）
  references?: string[]; // 参考资料文件名列表
  config?: Record<string, SkillConfigField>;
};

// 完整 Skill 记录
export type SkillRecord = SkillSummary & {
  prompt: string; // SKILL.md body（去 frontmatter 后的 markdown）
  config?: Record<string, SkillConfigField>; // config schema（来自 SKILL.md frontmatter）
};

// Skill 参考资料
export type SkillReference = {
  name: string;
  content: string;
};

// CAT.agent.skills API 请求
export type SkillApiRequest =
  | { action: "list"; scriptUuid: string }
  | { action: "get"; name: string; scriptUuid: string }
  | {
      action: "install";
      skillMd: string;
      scripts?: Array<{ name: string; code: string }>;
      references?: Array<{ name: string; content: string }>;
      scriptUuid: string;
    }
  | { action: "remove"; name: string; scriptUuid: string }
  | { action: "call"; skillName: string; scriptName: string; params?: Record<string, unknown>; scriptUuid: string };

// CAT.agent.opfs API 请求
export type OPFSApiRequest =
  | { action: "write"; path: string; content: string | Blob; scriptUuid: string }
  | { action: "read"; path: string; format?: "text" | "bloburl" | "blob"; scriptUuid: string }
  | { action: "readAttachment"; id: string; scriptUuid: string }
  | { action: "list"; path?: string; scriptUuid: string }
  | { action: "delete"; path: string; scriptUuid: string };

// ---- Skill Script 类型 ----

export type SkillScriptParam = {
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  description: string;
  enum?: string[];
};

export type SkillScriptMetadata = {
  name: string;
  description: string;
  params: SkillScriptParam[];
  grants: string[];
  requires: string[];
  timeout?: number; // 自定义超时时间（秒）
};

// OPFS 中存储的 Skill Script 记录
export type SkillScriptRecord = {
  id: string; // UUID，用于 OPFS data 文件名，避免 name 转文件名时的碰撞
  name: string;
  description: string;
  params: SkillScriptParam[];
  grants: string[];
  requires?: string[]; // @require URL 列表
  timeout?: number; // 自定义超时时间（秒）
  code: string; // 完整代码（含元数据头）
  sourceScriptUuid?: string; // 安装来源脚本的 UUID
  sourceScriptName?: string; // 安装来源脚本的名称
  installtime: number;
  updatetime: number;
};

// ---- CAT.agent.dom 类型 ----

export type TabInfo = {
  tabId: number;
  url: string;
  title: string;
  active: boolean;
  windowId: number;
  discarded: boolean;
};

export type ActionResult = {
  success: boolean;
  navigated?: boolean;
  url?: string;
  newTab?: { tabId: number; url: string };
};

export type PageContent = {
  title: string;
  url: string;
  html: string;
  truncated?: boolean;
  totalLength?: number;
};

export type ReadPageOptions = {
  tabId?: number;
  selector?: string;
  maxLength?: number;
  removeTags?: string[]; // 要移除的标签/选择器，如 ["script", "style", "svg"]
};

export type DomActionOptions = {
  tabId?: number;
  trusted?: boolean;
};

export type WaitForOptions = {
  tabId?: number;
  timeout?: number;
};

export type ScreenshotOptions = {
  tabId?: number;
  quality?: number;
  fullPage?: boolean;
  selector?: string; // CSS 选择器，截取指定元素区域
  saveTo?: string; // OPFS workspace 相对路径，截图后保存二进制
};

export type ScreenshotResult = {
  dataUrl: string; // 原始 data URL
  path?: string; // saveTo 时返回的 OPFS 路径
  size?: number; // saveTo 时返回的文件大小（字节）
};

export type NavigateOptions = {
  tabId?: number;
  waitUntil?: boolean;
  timeout?: number;
};

export type ScrollDirection = "up" | "down" | "top" | "bottom";

export type ScrollOptions = {
  tabId?: number;
  selector?: string;
};

export type ScrollResult = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  atBottom: boolean;
};

export type NavigateResult = {
  tabId: number;
  url: string;
  title: string;
};

export type WaitForResult = {
  found: boolean;
  element?: {
    selector: string;
    tag: string;
    text: string;
    role?: string;
    type?: string;
    visible: boolean;
  };
};

// GM API 请求类型
export type ExecuteScriptOptions = {
  tabId?: number;
};

export type MonitorResult = {
  dialogs: Array<{ type: string; message: string }>;
  addedNodes: Array<{ tag: string; id?: string; class?: string; role?: string; text: string }>;
};

export type MonitorStatus = {
  hasChanges: boolean;
  dialogCount: number;
  nodeCount: number;
};

export type DomApiRequest =
  | { action: "listTabs"; scriptUuid: string }
  | { action: "navigate"; url: string; options?: NavigateOptions; scriptUuid: string }
  | { action: "readPage"; options?: ReadPageOptions; scriptUuid: string }
  | { action: "screenshot"; options?: ScreenshotOptions; scriptUuid: string }
  | { action: "click"; selector: string; options?: DomActionOptions; scriptUuid: string }
  | { action: "fill"; selector: string; value: string; options?: DomActionOptions; scriptUuid: string }
  | { action: "scroll"; direction: ScrollDirection; options?: ScrollOptions; scriptUuid: string }
  | { action: "waitFor"; selector: string; options?: WaitForOptions; scriptUuid: string }
  | { action: "executeScript"; code: string; options?: ExecuteScriptOptions; scriptUuid: string }
  | { action: "startMonitor"; tabId: number; scriptUuid: string }
  | { action: "stopMonitor"; tabId: number; scriptUuid: string }
  | { action: "peekMonitor"; tabId: number; scriptUuid: string };

// ---- MCP 类型 ----

// MCP 服务器配置
export type MCPServerConfig = {
  id: string;
  name: string;
  url: string; // Streamable HTTP endpoint
  apiKey?: string; // 可选认证
  headers?: Record<string, string>; // 自定义请求头
  enabled: boolean;
  createtime: number;
  updatetime: number;
};

// MCP 工具（从服务器 tools/list 获取）
export type MCPTool = {
  serverId: string;
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>; // JSON Schema
};

// MCP 资源（从服务器 resources/list 获取）
export type MCPResource = {
  serverId: string;
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
};

// MCP 提示词模板（从服务器 prompts/list 获取）
export type MCPPrompt = {
  serverId: string;
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
};

// MCP 提示词消息（prompts/get 返回）
export type MCPPromptMessage = {
  role: "user" | "assistant";
  content:
    | { type: "text"; text: string }
    | { type: "resource"; resource: { uri: string; text: string; mimeType?: string } };
};

// CAT.agent.mcp API 请求
// scriptUuid 仅在 GM API 层用于权限校验，UI 直接调用时可省略
export type MCPApiRequest =
  | { action: "listServers"; scriptUuid?: string }
  | { action: "getServer"; id: string; scriptUuid?: string }
  | {
      action: "addServer";
      config: Omit<MCPServerConfig, "id" | "createtime" | "updatetime">;
      scriptUuid?: string;
    }
  | { action: "updateServer"; id: string; config: Partial<MCPServerConfig>; scriptUuid?: string }
  | { action: "removeServer"; id: string; scriptUuid?: string }
  | { action: "listTools"; serverId: string; scriptUuid?: string }
  | { action: "listResources"; serverId: string; scriptUuid?: string }
  | { action: "readResource"; serverId: string; uri: string; scriptUuid?: string }
  | { action: "listPrompts"; serverId: string; scriptUuid?: string }
  | {
      action: "getPrompt";
      serverId: string;
      name: string;
      args?: Record<string, string>;
      scriptUuid?: string;
    }
  | { action: "testConnection"; id: string; scriptUuid?: string };

// ---- Agent 定时任务类型 ----

/** 定时任务基础字段（两种模式共用） */
type AgentTaskBase = {
  id: string;
  name: string;
  crontab: string; // cron 表达式（复用 cron.ts 格式）
  enabled: boolean;
  notify: boolean; // 是否通过 chrome.notifications 通知
  // --- 运行状态 ---
  lastruntime?: number;
  nextruntime?: number;
  lastRunStatus?: "success" | "error";
  lastRunError?: string;
  createtime: number;
  updatetime: number;
};

/** 内置模式：由 Service Worker 自主执行 LLM 对话 */
export type InternalAgentTask = AgentTaskBase & {
  mode: "internal";
  prompt: string; // 每次触发发送的消息
  modelId?: string; // 使用的模型 ID
  conversationId?: string; // 可选：续接已有对话
  skills?: "auto" | string[];
  maxIterations?: number; // 工具循环上限，默认 10
};

/** 事件模式：通知用户脚本处理 */
export type EventAgentTask = AgentTaskBase & {
  mode: "event";
  sourceScriptUuid: string; // 创建任务的脚本 UUID
};

export type AgentTask = InternalAgentTask | EventAgentTask;

export type AgentTaskTrigger = {
  taskId: string;
  name: string;
  crontab: string;
  triggeredAt: number;
};

export type AgentTaskRun = {
  id: string;
  taskId: string;
  conversationId?: string; // internal 模式才有
  starttime: number;
  endtime?: number;
  status: "running" | "success" | "error";
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
};

export type AgentTaskApiRequest =
  | { action: "list" }
  | { action: "get"; id: string }
  | { action: "create"; task: Omit<AgentTask, "id" | "createtime" | "updatetime" | "nextruntime"> }
  | { action: "update"; id: string; task: Partial<AgentTask> }
  | { action: "delete"; id: string }
  | { action: "enable"; id: string; enabled: boolean }
  | { action: "runNow"; id: string }
  | { action: "listRuns"; taskId: string; limit?: number }
  | { action: "clearRuns"; taskId: string };

// Sandbox -> Service Worker 的 conversation API 请求
export type ConversationApiRequest =
  | { action: "create"; options: ConversationCreateOptions; scriptUuid: string }
  | { action: "get"; id: string; scriptUuid: string }
  | {
      action: "chat";
      conversationId: string;
      message: MessageContent;
      tools?: ToolDefinition[];
      scriptUuid: string;
      // ephemeral 会话专用字段
      ephemeral?: boolean;
      messages?: Array<{ role: MessageRole; content: MessageContent; toolCallId?: string; toolCalls?: ToolCall[] }>;
      system?: string;
      modelId?: string;
    }
  | { action: "getMessages"; conversationId: string; scriptUuid: string }
  | { action: "save"; conversationId: string; scriptUuid: string }
  | { action: "clearMessages"; conversationId: string; scriptUuid: string };
