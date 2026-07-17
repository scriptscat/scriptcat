import type { Group, IGetSender } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import type {
  AgentModelConfig,
  AgentModelSafeConfig,
  ChatRequest,
  ChatStreamEvent,
  ConversationApiRequest,
  ToolDefinition,
  DomApiRequest,
  SkillApiRequest,
  SkillMetadata,
  SkillRecord,
  SkillSummary,
  MessageContent,
  AgentTaskApiRequest,
  ModelApiRequest,
  OPFSApiRequest,
  MCPApiRequest,
} from "@App/app/service/agent/core/types";
import { agentChatRepo } from "@App/app/repo/agent_chat";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { ToolRegistry } from "@App/app/service/agent/core/tool_registry";
import { SKILL_SCRIPT_UUID_PREFIX } from "@App/app/service/agent/core/skill_script_executor";
import { CompactService } from "./compact_service";
import { LLMClient } from "./llm_client";
import { ToolLoopOrchestrator } from "./tool_loop_orchestrator";
import { AgentDomService } from "./dom";
import { MCPService } from "./mcp";
import { type ResourceService } from "@App/app/service/service_worker/resource";
import { SkillService } from "./skill_service";
import { AgentTaskService } from "./task_service";
import { AgentModelService } from "./model_service";
import { AgentTaskRepo, AgentTaskRunRepo } from "@App/app/repo/agent_task";
import { AgentTaskScheduler } from "@App/app/service/agent/core/task_scheduler";
import { WEB_FETCH_DEFINITION, WebFetchExecutor } from "@App/app/service/agent/core/tools/web_fetch";
import { WEB_SEARCH_DEFINITION, WebSearchExecutor } from "@App/app/service/agent/core/tools/web_search";
import { SearchConfigRepo, type SearchEngineConfig } from "@App/app/service/agent/core/tools/search_config";
import { SubAgentService } from "./sub_agent_service";
import { BackgroundSessionManager } from "./background_session_manager";
import { createOPFSTools, setCreateBlobUrlFn } from "@App/app/service/agent/core/tools/opfs_tools";
import { createObjectURL } from "@App/app/service/offscreen/client";
import { AgentOPFSService } from "./opfs_service";
import { executeSkillScript } from "@App/app/service/offscreen/client";
import { createTabTools } from "@App/app/service/agent/core/tools/tab_tools";
import { ChatService } from "./chat_service";

// 保留对外 API（测试文件直接从 "./agent" import 这三个函数）
export { isRetryableError, withRetry, classifyErrorCode } from "./retry_utils";

export class AgentService {
  private toolRegistry = new ToolRegistry();
  // Skill 相关功能委托给 SkillService
  private skillService!: SkillService;

  // 模型管理委托给 AgentModelService
  private modelService!: AgentModelService;

  private domService = new AgentDomService();
  private mcpService!: MCPService;
  // OPFS API 处理委托给 AgentOPFSService
  private opfsService!: AgentOPFSService;
  private taskRepo = new AgentTaskRepo();
  private taskRunRepo = new AgentTaskRunRepo();
  private taskScheduler!: AgentTaskScheduler;
  // 定时任务逻辑委托给 AgentTaskService
  private agentTaskService!: AgentTaskService;
  private searchConfigRepo = new SearchConfigRepo();
  // 后台运行的会话注册表（委托给 BackgroundSessionManager）
  private bgSessionManager = new BackgroundSessionManager();
  // 子代理编排逻辑委托给 SubAgentService
  private subAgentService: SubAgentService;
  // 上下文压缩逻辑委托给 CompactService
  private compactService!: CompactService;
  // LLM HTTP 调用（流式、重试、图片保存）委托给 LLMClient
  private llmClient!: LLMClient;
  // Tool calling 循环编排委托给 ToolLoopOrchestrator
  private toolLoopOrchestrator!: ToolLoopOrchestrator;
  // 主聊天入口及会话 CRUD 委托给 ChatService
  private chatService!: ChatService;

  constructor(
    private group: Group,
    private sender: MessageSend,
    resourceService?: ResourceService
  ) {
    this.skillService = new SkillService(sender, resourceService);
    this.modelService = new AgentModelService(group);
    this.opfsService = new AgentOPFSService(sender);
    this.llmClient = new LLMClient(agentChatRepo);
    this.compactService = new CompactService(
      this.modelService,
      {
        callLLM: (model, params, sendEvent, signal) => this.llmClient.callLLM(model, params, sendEvent, signal),
      },
      agentChatRepo
    );
    // ToolLoopOrchestrator 不持有 toolRegistry，每次 callLLMWithToolLoop 由调用方传入
    // （通常是 SessionToolRegistry，保证并发会话工具注册互相隔离）
    this.toolLoopOrchestrator = new ToolLoopOrchestrator(
      {
        // callLLM 通过 lambda 注入，确保测试 spy 可以拦截 service.callLLM
        callLLM: (model, params, sendEvent, signal) => this.callLLM(model, params, sendEvent, signal),
        autoCompact: (convId, model, msgs, sendEvent, signal) =>
          this.compactService.autoCompact(convId, model, msgs, sendEvent, signal),
      },
      agentChatRepo
    );
    // SubAgentService 不持有 toolRegistry，runSubAgent 时由调用方（chat_service）传入父会话的 sessionRegistry
    this.subAgentService = new SubAgentService({
      callLLMWithToolLoop: (params) => this.callLLMWithToolLoop(params),
    });
    this.chatService = new ChatService(
      this.toolRegistry,
      this.modelService,
      this.skillService,
      this.bgSessionManager,
      this.subAgentService,
      {
        executeInPage: (code, options) => this.domService.executeScript(code, options),
        executeInSandbox: (code) => {
          const uuid = SKILL_SCRIPT_UUID_PREFIX + uuidv4();
          return executeSkillScript(this.sender, {
            uuid,
            code,
            args: {},
            grants: [],
            name: "execute_script",
          });
        },
      },
      {
        callLLM: (model, params, sendEvent, signal) => this.callLLM(model, params, sendEvent, signal),
        callLLMWithToolLoop: (params) => this.callLLMWithToolLoop(params),
      },
      agentChatRepo
    );
  }

  handleDomApi(request: DomApiRequest): Promise<unknown> {
    return this.domService.handleDomApi(request);
  }

  init() {
    // 注入 chatRepo 到 ToolRegistry 用于保存附件
    this.toolRegistry.setChatRepo(agentChatRepo);
    // 初始化 MCP Service
    this.mcpService = new MCPService(this.toolRegistry);
    this.mcpService.init();
    // Sandbox conversation API
    this.group.on("conversation", this.handleConversation.bind(this));
    // 流式聊天（UI 和 Sandbox 共用）
    this.group.on("conversationChat", this.handleConversationChat.bind(this));
    // 附加到后台运行中的会话
    this.group.on("attachToConversation", this.handleAttachToConversation.bind(this));
    // 获取正在运行的会话 ID 列表
    this.group.on("getRunningConversationIds", () => this.getRunningConversationIds());
    // Skill 管理（供 Options UI 调用）
    this.group.on(
      "installSkill",
      (params: {
        skillMd: string;
        scripts?: Array<{ name: string; code: string }>;
        references?: Array<{ name: string; content: string }>;
      }) => this.installSkill(params.skillMd, params.scripts, params.references)
    );
    this.group.on("removeSkill", (name: string) => this.removeSkill(name));
    this.group.on("refreshSkill", (name: string) => this.refreshSkill(name));
    this.group.on("setSkillEnabled", (params: { name: string; enabled: boolean }) =>
      this.setSkillEnabled(params.name, params.enabled)
    );
    this.group.on("getSkillConfigValues", (name: string) => this.skillService.skillRepo.getConfigValues(name));
    this.group.on("saveSkillConfig", (params: { name: string; values: Record<string, unknown> }) =>
      this.skillService.skillRepo.saveConfigValues(params.name, params.values)
    );
    // Skill 安装页面相关消息
    this.group.on("prepareSkillInstall", (zipBase64: string) => this.prepareSkillInstall(zipBase64));
    this.group.on("prepareSkillFromUrl", (url: string) => this.skillService.prepareSkillFromUrl(url));
    this.group.on("getSkillInstallData", (uuid: string) => this.getSkillInstallData(uuid));
    this.group.on("completeSkillInstall", (uuid: string) => this.completeSkillInstall(uuid));
    this.group.on("cancelSkillInstall", (uuid: string) => this.cancelSkillInstall(uuid));
    // Skill 更新检查
    this.group.on("checkForUpdates", () => this.skillService.checkForUpdates());
    this.group.on("updateSkill", (name: string) => this.skillService.updateSkill(name));
    // Model CRUD 及摘要模型 API（委托给 AgentModelService）
    this.modelService.init();
    // MCP API（供 Options UI 调用，复用已有的 handleMCPApi）
    this.group.on("mcpApi", (request: MCPApiRequest) => this.mcpService.handleMCPApi(request));
    // Agent 定时任务 API
    this.group.on("agentTask", (params: AgentTaskApiRequest) => this.agentTaskService.handleAgentTask(params));
    // 初始化 AgentTaskService（在 skillService 初始化后）
    this.agentTaskService = new AgentTaskService(
      this.sender,
      agentChatRepo,
      this.toolRegistry,
      this.skillService,
      {
        getModel: (id) => this.getModel(id),
        callLLMWithToolLoop: (params) => this.callLLMWithToolLoop(params),
      },
      this.taskRepo,
      this.taskRunRepo
    );
    // 初始化定时任务调度器
    this.taskScheduler = new AgentTaskScheduler(
      this.taskRepo,
      this.taskRunRepo,
      (task) => this.agentTaskService.executeInternalTask(task),
      (task) => this.agentTaskService.emitTaskEvent(task)
    );
    this.taskScheduler.init();
    // 注入 scheduler 到 AgentTaskService（解决循环依赖）
    this.agentTaskService.setScheduler(this.taskScheduler);
    // 搜索配置 API（供 Options UI 调用）
    this.group.on("getSearchConfig", () => this.searchConfigRepo.getConfig());
    this.group.on("saveSearchConfig", (config: SearchEngineConfig) => this.searchConfigRepo.saveConfig(config));
    // 注册永久内置工具
    this.toolRegistry.registerBuiltin(
      WEB_FETCH_DEFINITION,
      new WebFetchExecutor(this.sender, {
        summarize: (content, prompt) => this.summarizeContent(content, prompt),
      })
    );
    this.toolRegistry.registerBuiltin(WEB_SEARCH_DEFINITION, new WebSearchExecutor(this.sender, this.searchConfigRepo));
    // 注册 OPFS 工作区文件工具
    // 注入 blob URL 创建函数（通过 Offscreen 的 URL.createObjectURL）
    setCreateBlobUrlFn(async (data: ArrayBuffer, mimeType: string) => {
      const blob = new Blob([data], { type: mimeType });
      return (await createObjectURL(this.sender, { blob, persistence: true })) as string;
    });
    const opfsTools = createOPFSTools();
    for (const t of opfsTools.tools) {
      this.toolRegistry.registerBuiltin(t.definition, t.executor);
    }
    // 注册 Tab 操作工具
    const tabTools = createTabTools({
      sender: this.sender,
      summarize: (content, prompt) => this.summarizeContent(content, prompt),
    });
    for (const t of tabTools.tools) {
      this.toolRegistry.registerBuiltin(t.definition, t.executor);
    }
    // 加载已安装的 Skills
    this.skillService.loadSkills();
  }

  // 获取工具注册表（供外部注册内置工具）
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  // ---- Skill 管理（瘦委托到 SkillService）----

  // 安装 Skill
  async installSkill(
    skillMd: string,
    scripts?: Array<{ name: string; code: string }>,
    references?: Array<{ name: string; content: string }>
  ): Promise<SkillRecord> {
    return this.skillService.installSkill(skillMd, scripts, references);
  }

  // 卸载 Skill
  async removeSkill(name: string): Promise<boolean> {
    return this.skillService.removeSkill(name);
  }

  // 刷新单个 Skill 缓存（从 OPFS 重新加载）
  async refreshSkill(name: string): Promise<boolean> {
    return this.skillService.refreshSkill(name);
  }

  // 启用/禁用 Skill
  async setSkillEnabled(name: string, enabled: boolean): Promise<boolean> {
    return this.skillService.setSkillEnabled(name, enabled);
  }

  // 缓存 Skill ZIP 数据，返回 uuid，供安装页面获取
  async prepareSkillInstall(zipBase64: string): Promise<string> {
    return this.skillService.prepareSkillInstall(zipBase64);
  }

  // 获取缓存的 Skill 安装数据并解析
  async getSkillInstallData(uuid: string): Promise<{
    skillMd: string;
    metadata: SkillMetadata;
    prompt: string;
    scripts: Array<{ name: string; code: string }>;
    references: Array<{ name: string; content: string }>;
    isUpdate: boolean;
    installUrl?: string;
  }> {
    return this.skillService.getSkillInstallData(uuid);
  }

  // Skill 安装页面确认安装
  async completeSkillInstall(uuid: string): Promise<SkillRecord> {
    return this.skillService.completeSkillInstall(uuid);
  }

  // Skill 安装页面取消
  async cancelSkillInstall(uuid: string): Promise<void> {
    return this.skillService.cancelSkillInstall(uuid);
  }

  // 处理 CAT.agent.skills API 请求
  async handleSkillsApi(request: SkillApiRequest): Promise<SkillSummary[] | SkillRecord | null | boolean | unknown> {
    return this.skillService.handleSkillsApi(request);
  }

  // 处理 CAT.agent.opfs API 请求，委托给 AgentOPFSService
  async handleOPFSApi(request: OPFSApiRequest, sender: IGetSender): Promise<unknown> {
    return this.opfsService.handleOPFSApi(request, sender, agentChatRepo);
  }

  // 获取模型配置，委托给 AgentModelService
  private async getModel(modelId?: string): Promise<AgentModelConfig> {
    return this.modelService.getModel(modelId);
  }

  // 定时任务调度器 tick，由 alarm handler 调用
  async onSchedulerTick() {
    await this.taskScheduler.tick();
  }

  // 处理 conversation API 请求（非流式），供 GMApi 调用
  async handleConversationApi(params: ConversationApiRequest) {
    return this.handleConversation(params);
  }

  // 处理定时任务 API 请求，供 GMApi 调用
  async handleAgentTaskApi(params: AgentTaskApiRequest) {
    return this.agentTaskService.handleAgentTask(params);
  }

  // 处理 CAT.agent.model API 请求，委托给 AgentModelService
  async handleModelApi(
    request: ModelApiRequest
  ): Promise<AgentModelSafeConfig[] | AgentModelSafeConfig | null | string> {
    return this.modelService.handleModelApi(request);
  }

  // 处理流式 conversation chat，供 GMApi 调用
  async handleConversationChatFromGmApi(
    params: {
      conversationId: string;
      message: MessageContent;
      tools?: ToolDefinition[];
      maxIterations?: number;
      scriptUuid: string;
      // ephemeral 会话专用字段
      ephemeral?: boolean;
      messages?: ChatRequest["messages"];
      system?: string;
      modelId?: string;
      cache?: boolean;
      background?: boolean;
    },
    sender: IGetSender
  ) {
    return this.handleConversationChat(params, sender);
  }

  // 附加到后台运行会话，供 GMApi 调用
  async handleAttachToConversationFromGmApi(params: { conversationId: string }, sender: IGetSender) {
    return this.handleAttachToConversation(params, sender);
  }

  // 获取正在运行的会话 ID 列表
  getRunningConversationIds(): string[] {
    return this.bgSessionManager.listIds();
  }

  // 附加到后台运行中的会话（委托给 BackgroundSessionManager）
  private async handleAttachToConversation(params: { conversationId: string }, sender: IGetSender) {
    return this.bgSessionManager.handleAttach(params, sender);
  }

  // 处理 Sandbox conversation API 请求（非流式，委托给 ChatService）
  private async handleConversation(params: ConversationApiRequest) {
    return this.chatService.handleConversation(params);
  }

  // 统一的 tool calling 循环，UI 和脚本共用（委托给 ToolLoopOrchestrator）
  private callLLMWithToolLoop(params: Parameters<ToolLoopOrchestrator["callLLMWithToolLoop"]>[0]): Promise<void> {
    return this.toolLoopOrchestrator.callLLMWithToolLoop(params);
  }

  // 主聊天入口（委托给 ChatService）
  private async handleConversationChat(
    params: Parameters<ChatService["handleConversationChat"]>[0],
    sender: IGetSender
  ) {
    return this.chatService.handleConversationChat(params, sender);
  }

  // 对内容做摘要/提取（供 tab 工具使用）
  // 优先使用摘要模型，fallback 到默认模型
  private async summarizeContent(content: string, prompt: string): Promise<string> {
    return this.compactService.summarizeContent(content, prompt);
  }

  // 调用 LLM 并收集完整响应（委托给 LLMClient）
  private async callLLM(
    model: AgentModelConfig,
    params: { messages: ChatRequest["messages"]; tools?: ToolDefinition[]; cache?: boolean },
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ) {
    return this.llmClient.callLLM(model, params, sendEvent, signal);
  }
}
