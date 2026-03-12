import type { Group, IGetSender } from "@Packages/message/server";
import { GetSenderType } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import type { AgentModelConfig } from "@App/app/service/agent/types";
import type { Script } from "@App/app/repo/scripts";
import { i18nName } from "@App/locales/locales";
import type {
  ChatRequest,
  ChatStreamEvent,
  ConversationApiRequest,
  Conversation,
  ToolCall,
  ToolDefinition,
  CATToolApiRequest,
  CATToolRecord,
  DomApiRequest,
  MCPApiRequest,
  SkillApiRequest,
  SkillRecord,
} from "@App/app/service/agent/types";
import { buildOpenAIRequest, parseOpenAIStream } from "@App/app/service/agent/providers/openai";
import { buildAnthropicRequest, parseAnthropicStream } from "@App/app/service/agent/providers/anthropic";
import { AgentChatRepo } from "@App/app/repo/agent_chat";
import { AgentModelRepo } from "@App/app/repo/agent_model";
import { CATToolRepo } from "@App/app/repo/cattool_repo";
import { SkillRepo } from "@App/app/repo/skill_repo";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { ToolRegistry } from "@App/app/service/agent/tool_registry";
import type { ScriptToolCallback, ToolExecutor } from "@App/app/service/agent/tool_registry";
import { parseCATToolMetadata, catToolToToolDefinition } from "@App/pkg/utils/cattool";
import { parseSkillMd } from "@App/pkg/utils/skill";
import { CATToolExecutor } from "@App/app/service/agent/cattool_executor";
import { CACHE_KEY_CATTOOL_INSTALL } from "@App/app/cache_key";
import { cacheInstance } from "@App/app/cache";
import { AgentDomService } from "./agent_dom";
import { MCPService } from "./agent_mcp";
import { registerDomTools } from "@App/app/service/agent/dom_tools";

// 安装超时时间：5 分钟
const CATTOOL_INSTALL_TIMEOUT = 5 * 60 * 1000;

export class AgentService {
  private repo = new AgentChatRepo();
  private catToolRepo = new CATToolRepo();
  private skillRepo = new SkillRepo();
  private toolRegistry = new ToolRegistry();
  // 已加载的 Skill 缓存
  private skillCache = new Map<string, SkillRecord>();
  // 待确认的 CATTool 安装请求
  private pendingInstalls = new Map<
    string,
    {
      resolve: (record: CATToolRecord) => void;
      reject: (error: Error) => void;
      tabId: number;
      timer: ReturnType<typeof setTimeout>;
      onTabRemoved: (tabId: number) => void;
    }
  >();

  private modelRepo = new AgentModelRepo();
  private domService = new AgentDomService();
  private mcpService!: MCPService;

  constructor(
    private group: Group,
    private sender: MessageSend
  ) {}

  init() {
    // 初始化 MCP Service
    this.mcpService = new MCPService(this.toolRegistry);
    this.mcpService.init();
    // 注册 DOM 工具到 ToolRegistry
    registerDomTools(this.toolRegistry, this.domService);
    // Sandbox conversation API
    this.group.on("conversation", this.handleConversation.bind(this));
    // 流式聊天（UI 和 Sandbox 共用）
    this.group.on("conversationChat", this.handleConversationChat.bind(this));
    // 通过 install page 安装 CATTool（文件/URL 安装，无来源脚本）
    this.group.on("installCATTool", (code: string) => this.installCATTool(code));
    // CATTool 安装页面相关消息
    this.group.on("getCATToolInstallCode", (uuid: string) => this.getCATToolInstallCode(uuid));
    this.group.on("completeCATToolInstall", (uuid: string) => this.completeCATToolInstall(uuid));
    this.group.on("cancelCATToolInstall", (uuid: string) => this.cancelCATToolInstall(uuid));
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
    // 加载已安装的 CATTools
    this.loadCATTools();
    // 加载已安装的 Skills
    this.loadSkills();
  }

  // 获取工具注册表（供外部注册内置工具）
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  // 从 OPFS 加载所有 CATTool 并注册到 ToolRegistry
  private async loadCATTools() {
    try {
      const summaries = await this.catToolRepo.listTools();
      for (const summary of summaries) {
        // 读取完整记录（含 code），CATToolExecutor 需要 code 执行
        const tool = await this.catToolRepo.getTool(summary.name);
        if (!tool) continue;
        const def = catToolToToolDefinition({
          name: tool.name,
          description: tool.description,
          params: tool.params,
          grants: tool.grants,
        });
        this.toolRegistry.registerBuiltin(def, new CATToolExecutor(tool, this.sender));
      }
    } catch {
      // OPFS 可能在 SW 环境不可用，静默忽略
    }
  }

  // 安装 CATTool
  async installCATTool(code: string, sourceScriptUuid?: string, sourceScriptName?: string): Promise<CATToolRecord> {
    const metadata = parseCATToolMetadata(code);
    if (!metadata) {
      throw new Error("Invalid CATTool: missing or malformed ==CATTool== header");
    }

    const now = Date.now();
    const existing = await this.catToolRepo.getTool(metadata.name);
    const record: CATToolRecord = {
      id: existing?.id || uuidv4(),
      name: metadata.name,
      description: metadata.description,
      params: metadata.params,
      grants: metadata.grants,
      code,
      sourceScriptUuid: sourceScriptUuid || existing?.sourceScriptUuid,
      sourceScriptName: sourceScriptName || existing?.sourceScriptName,
      installtime: existing?.installtime || now,
      updatetime: now,
    };

    await this.catToolRepo.saveTool(record);

    // 注册/更新到 ToolRegistry
    const def = catToolToToolDefinition(metadata);
    this.toolRegistry.unregisterBuiltin(metadata.name);
    this.toolRegistry.registerBuiltin(def, new CATToolExecutor(record, this.sender));

    return record;
  }

  // 卸载 CATTool
  async removeCATTool(name: string): Promise<boolean> {
    const removed = await this.catToolRepo.removeTool(name);
    if (removed) {
      this.toolRegistry.unregisterBuiltin(name);
    }
    return removed;
  }

  // 根据名称获取 CATTool 的 grants（供 GM API 权限验证使用）
  async getCATToolGrants(name: string): Promise<string[]> {
    const tool = await this.catToolRepo.getTool(name);
    return tool?.grants || [];
  }

  // 直接调用 CATTool
  async callCATTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    const tool = await this.catToolRepo.getTool(name);
    if (!tool) {
      throw new Error(`CATTool "${name}" not found`);
    }
    const executor = new CATToolExecutor(tool, this.sender);
    return executor.execute(params);
  }

  // 打开安装页面让用户确认安装 CATTool
  async openCATToolInstallPage(code: string, scriptUuid?: string, scriptName?: string): Promise<CATToolRecord> {
    const uuid = uuidv4();
    // 缓存代码和来源信息到 session storage
    await cacheInstance.set(CACHE_KEY_CATTOOL_INSTALL + uuid, { code, scriptUuid, scriptName });
    // 打开安装页面
    const tab = await chrome.tabs.create({
      url: `/src/install.html?cattool=${uuid}`,
    });
    if (!tab.id) {
      await cacheInstance.del(CACHE_KEY_CATTOOL_INSTALL + uuid);
      throw new Error("Failed to create install tab");
    }
    const tabId = tab.id;

    return new Promise<CATToolRecord>((resolve, reject) => {
      // 超时处理
      const timer = setTimeout(() => {
        this.cleanupPendingInstall(uuid);
        reject(new Error("CATTool install timed out"));
      }, CATTOOL_INSTALL_TIMEOUT);

      // 监听 tab 关闭作为取消的 fallback
      const onTabRemoved = (removedTabId: number) => {
        if (removedTabId === tabId && this.pendingInstalls.has(uuid)) {
          this.cleanupPendingInstall(uuid);
          reject(new Error("CATTool install cancelled by user"));
        }
      };
      chrome.tabs.onRemoved.addListener(onTabRemoved);

      this.pendingInstalls.set(uuid, { resolve, reject, tabId, timer, onTabRemoved });
    });
  }

  // 供安装页面获取缓存的 CATTool 安装信息
  async getCATToolInstallCode(uuid: string): Promise<{
    code: string;
    scriptName?: string;
    isUpdate?: boolean;
  }> {
    const cached = await cacheInstance.get<{ code: string; scriptUuid?: string; scriptName?: string }>(
      CACHE_KEY_CATTOOL_INSTALL + uuid
    );
    if (!cached) {
      throw new Error("CATTool install code not found or expired");
    }
    // 检查同名工具是否已存在
    const metadata = parseCATToolMetadata(cached.code);
    let isUpdate = false;
    if (metadata) {
      const existing = await this.catToolRepo.getTool(metadata.name);
      if (existing) {
        isUpdate = true;
      }
    }
    return {
      code: cached.code,
      scriptName: cached.scriptName,
      isUpdate,
    };
  }

  // 安装页面通知安装完成
  async completeCATToolInstall(uuid: string): Promise<void> {
    const pending = this.pendingInstalls.get(uuid);
    if (!pending) {
      return;
    }
    try {
      const cached = await cacheInstance.get<{ code: string; scriptUuid?: string; scriptName?: string }>(
        CACHE_KEY_CATTOOL_INSTALL + uuid
      );
      if (!cached) {
        throw new Error("CATTool install code not found or expired");
      }
      const record = await this.installCATTool(cached.code, cached.scriptUuid, cached.scriptName);
      pending.resolve(record);
    } catch (e: any) {
      pending.reject(e);
    } finally {
      this.cleanupPendingInstall(uuid);
    }
  }

  // 安装页面通知取消
  async cancelCATToolInstall(uuid: string): Promise<void> {
    const pending = this.pendingInstalls.get(uuid);
    if (!pending) {
      return;
    }
    try {
      pending.reject(new Error("CATTool install cancelled by user"));
    } finally {
      await this.cleanupPendingInstall(uuid);
    }
  }

  // 清理待确认安装的状态
  private async cleanupPendingInstall(uuid: string) {
    const pending = this.pendingInstalls.get(uuid);
    if (pending) {
      clearTimeout(pending.timer);
      chrome.tabs.onRemoved.removeListener(pending.onTabRemoved);
      this.pendingInstalls.delete(uuid);
    }
    await cacheInstance.del(CACHE_KEY_CATTOOL_INSTALL + uuid);
  }

  // 处理 CAT.agent.tools API 请求
  async handleToolsApi(request: CATToolApiRequest, script?: Script): Promise<unknown> {
    switch (request.action) {
      case "install":
        return this.openCATToolInstallPage(request.code, script?.uuid, script ? i18nName(script) : undefined);
      case "remove":
        return this.removeCATTool(request.name);
      case "list":
        return this.catToolRepo.listTools();
      case "call":
        return this.callCATTool(request.name, request.params);
      default:
        throw new Error(`Unknown tools action: ${(request as any).action}`);
    }
  }

  // ---- Skill 管理 ----

  // 从 OPFS 加载所有 Skill 到缓存
  private async loadSkills() {
    try {
      const summaries = await this.skillRepo.listSkills();
      for (const summary of summaries) {
        const record = await this.skillRepo.getSkill(summary.name);
        if (record) {
          this.skillCache.set(record.name, record);
        }
      }
    } catch {
      // OPFS 可能不可用，静默忽略
    }
  }

  // 安装 Skill
  async installSkill(
    skillMd: string,
    scripts?: Array<{ name: string; code: string }>,
    references?: Array<{ name: string; content: string }>
  ): Promise<SkillRecord> {
    const parsed = parseSkillMd(skillMd);
    if (!parsed) {
      throw new Error("Invalid SKILL.md: missing or malformed frontmatter");
    }

    // 解析 CATTool 脚本
    const toolRecords: CATToolRecord[] = [];
    const toolNames: string[] = [];
    if (scripts) {
      for (const script of scripts) {
        const metadata = parseCATToolMetadata(script.code);
        if (!metadata) {
          throw new Error(`Invalid CATTool script "${script.name}": missing ==CATTool== header`);
        }
        toolNames.push(metadata.name);
        const now = Date.now();
        toolRecords.push({
          id: uuidv4(),
          name: metadata.name,
          description: metadata.description,
          params: metadata.params,
          grants: metadata.grants,
          code: script.code,
          installtime: now,
          updatetime: now,
        });
      }
    }

    const referenceNames = references?.map((r) => r.name) || [];

    const now = Date.now();
    const existing = await this.skillRepo.getSkill(parsed.metadata.name);
    const record: SkillRecord = {
      name: parsed.metadata.name,
      description: parsed.metadata.description,
      toolNames,
      referenceNames,
      prompt: parsed.prompt,
      installtime: existing?.installtime || now,
      updatetime: now,
    };

    const skillRefs = references?.map((r) => ({ name: r.name, content: r.content }));
    await this.skillRepo.saveSkill(record, toolRecords, skillRefs);
    this.skillCache.set(record.name, record);

    return record;
  }

  // 卸载 Skill
  async removeSkill(name: string): Promise<boolean> {
    const removed = await this.skillRepo.removeSkill(name);
    if (removed) {
      this.skillCache.delete(name);
    }
    return removed;
  }

  // 处理 CAT.agent.skills API 请求
  async handleSkillsApi(request: SkillApiRequest): Promise<unknown> {
    switch (request.action) {
      case "list":
        return this.skillRepo.listSkills();
      case "get":
        return this.skillRepo.getSkill(request.name);
      case "install":
        return this.installSkill(request.skillMd, request.scripts, request.references);
      case "remove":
        return this.removeSkill(request.name);
      default:
        throw new Error(`Unknown skills action: ${(request as any).action}`);
    }
  }

  // 解析对话关联的 skills，返回 system prompt 附加内容和 meta-tool 定义
  // 三层渐进加载：1) system prompt 只注入摘要 2) load_skill 按需加载完整提示词 3) execute_skill_tool/read_reference 按需执行
  private resolveSkills(skills?: "auto" | string[]): {
    promptSuffix: string;
    metaTools: Array<{ definition: ToolDefinition; executor: ToolExecutor }>;
  } {
    if (!skills) {
      return { promptSuffix: "", metaTools: [] };
    }

    // 确定要加载的 skill 列表
    let skillRecords: SkillRecord[];
    if (skills === "auto") {
      skillRecords = Array.from(this.skillCache.values());
    } else {
      skillRecords = skills.map((name) => this.skillCache.get(name)).filter((r): r is SkillRecord => r != null);
    }

    if (skillRecords.length === 0) {
      return { promptSuffix: "", metaTools: [] };
    }

    // 构建 prompt 后缀：只包含 name + description 摘要
    const promptParts: string[] = [
      "\n\n---\n\n# Available Skills\n",
      "Below are installed skills. Use `load_skill` to read the full prompt when a skill is relevant.\n",
    ];

    // 检查是否有任何工具或参考资料
    let hasTools = false;
    let hasReferences = false;

    for (const skill of skillRecords) {
      promptParts.push(`- **${skill.name}**: ${skill.description || "(no description)"}`);
      if (skill.toolNames.length > 0) hasTools = true;
      if (skill.referenceNames.length > 0) hasReferences = true;
    }

    promptParts.push(
      "\nWhen a skill is loaded, you can use `execute_skill_tool` to run its tools and `read_reference` to read its reference documents."
    );

    // 构建 meta-tools
    const metaTools: Array<{ definition: ToolDefinition; executor: ToolExecutor }> = [];

    // load_skill — 始终注册
    metaTools.push({
      definition: {
        name: "load_skill",
        description:
          "Load the full prompt of a skill by name. Use this to get detailed instructions before using a skill.",
        parameters: {
          type: "object",
          properties: {
            skill_name: { type: "string", description: "Name of the skill to load" },
          },
          required: ["skill_name"],
        },
      },
      executor: {
        execute: async (args: Record<string, unknown>) => {
          const skillName = args.skill_name as string;
          const record = this.skillCache.get(skillName);
          if (!record) {
            throw new Error(`Skill "${skillName}" not found`);
          }
          return record.prompt;
        },
      },
    });

    // execute_skill_tool — 有工具时才注册
    if (hasTools) {
      metaTools.push({
        definition: {
          name: "execute_skill_tool",
          description:
            "Execute a tool from a specific skill. Load the skill first with `load_skill` to see available tools and their parameters.",
          parameters: {
            type: "object",
            properties: {
              skill_name: { type: "string", description: "Name of the skill that owns the tool" },
              tool_name: { type: "string", description: "Name of the tool to execute" },
              arguments: {
                type: "object",
                description: "Arguments to pass to the tool, as specified in the tool's parameter schema",
              },
            },
            required: ["skill_name", "tool_name"],
          },
        },
        executor: {
          execute: async (args: Record<string, unknown>) => {
            const skillName = args.skill_name as string;
            const toolName = args.tool_name as string;
            const toolArgs = (args.arguments as Record<string, unknown>) || {};

            // 按需从 OPFS 加载 skill 的 CATTool 脚本
            const toolRecords = await this.skillRepo.getSkillScripts(skillName);
            const tool = toolRecords.find((t) => t.name === toolName);
            if (!tool) {
              throw new Error(`Tool "${toolName}" not found in skill "${skillName}"`);
            }
            const executor = new CATToolExecutor(tool, this.sender);
            return executor.execute(toolArgs);
          },
        },
      });
    }

    // read_reference — 有参考资料时才注册
    if (hasReferences) {
      metaTools.push({
        definition: {
          name: "read_reference",
          description:
            "Read a reference document from a skill. Load the skill first with `load_skill` to see available references.",
          parameters: {
            type: "object",
            properties: {
              skill_name: { type: "string", description: "Name of the skill that owns the reference" },
              reference_name: { type: "string", description: "Name of the reference document to read" },
            },
            required: ["skill_name", "reference_name"],
          },
        },
        executor: {
          execute: async (args: Record<string, unknown>) => {
            const skillName = args.skill_name as string;
            const refName = args.reference_name as string;
            const ref = await this.skillRepo.getReference(skillName, refName);
            if (!ref) {
              throw new Error(`Reference "${refName}" not found in skill "${skillName}"`);
            }
            return ref.content;
          },
        },
      });
    }

    return { promptSuffix: promptParts.join("\n"), metaTools };
  }

  // 获取模型配置
  private async getModel(modelId?: string): Promise<AgentModelConfig> {
    let model: AgentModelConfig | undefined;
    if (modelId) {
      model = await this.modelRepo.getModel(modelId);
    }
    if (!model) {
      const defaultId = await this.modelRepo.getDefaultModelId();
      if (defaultId) {
        model = await this.modelRepo.getModel(defaultId);
      }
    }
    if (!model) {
      const models = await this.modelRepo.listModels();
      if (models.length > 0) {
        model = models[0];
      }
    }
    if (!model) {
      throw new Error("No model configured. Please configure a model in Agent settings.");
    }
    return model;
  }

  // 处理 conversation API 请求（非流式），供 GMApi 调用
  async handleConversationApi(params: ConversationApiRequest) {
    return this.handleConversation(params);
  }

  // 处理流式 conversation chat，供 GMApi 调用
  async handleConversationChatFromGmApi(
    params: {
      conversationId: string;
      message: string;
      tools?: ToolDefinition[];
      maxIterations?: number;
      scriptUuid: string;
      // ephemeral 会话专用字段
      ephemeral?: boolean;
      messages?: ChatRequest["messages"];
      system?: string;
      modelId?: string;
    },
    sender: IGetSender
  ) {
    return this.handleConversationChat(params, sender);
  }

  // 处理 Sandbox conversation API 请求（非流式）
  private async handleConversation(params: ConversationApiRequest) {
    switch (params.action) {
      case "create":
        return this.createConversation(params);
      case "get":
        return this.getConversation(params.id);
      case "getMessages":
        return this.repo.getMessages(params.conversationId);
      case "save":
        // 对话已经在 chat 过程中持久化，这里确保元数据也保存
        return true;
      case "clearMessages":
        await this.repo.saveMessages(params.conversationId, []);
        return true;
      default:
        throw new Error(`Unknown conversation action: ${(params as any).action}`);
    }
  }

  private async createConversation(params: Extract<ConversationApiRequest, { action: "create" }>) {
    const model = await this.getModel(params.options.model);
    const conv: Conversation = {
      id: params.options.id || uuidv4(),
      title: "New Chat",
      modelId: model.id,
      system: params.options.system,
      skills: params.options.skills,
      createtime: Date.now(),
      updatetime: Date.now(),
    };
    await this.repo.saveConversation(conv);
    return conv;
  }

  private async getConversation(id: string): Promise<Conversation | null> {
    const conversations = await this.repo.listConversations();
    return conversations.find((c) => c.id === id) || null;
  }

  // 统一的 tool calling 循环，UI 和脚本共用
  private async callLLMWithToolLoop(params: {
    model: AgentModelConfig;
    messages: ChatRequest["messages"];
    tools?: ToolDefinition[];
    maxIterations: number;
    sendEvent: (event: ChatStreamEvent) => void;
    signal: AbortSignal;
    // 脚本自定义工具的回调，null 表示只用内置工具
    scriptToolCallback: ScriptToolCallback | null;
    // 对话 ID，用于持久化消息（可选，UI 场景由 hooks 自行持久化）
    conversationId?: string;
    // 跳过内置工具，仅使用传入的 tools（ephemeral 模式）
    skipBuiltinTools?: boolean;
  }): Promise<void> {
    const { model, messages, tools, maxIterations, sendEvent, signal, scriptToolCallback, conversationId } = params;

    // 合并内置工具和脚本工具定义
    const allToolDefs = params.skipBuiltinTools ? (tools || []) : this.toolRegistry.getDefinitions(tools);

    const startTime = Date.now();
    let iterations = 0;
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    while (iterations < maxIterations) {
      iterations++;

      // 调用 LLM
      const result = await this.callLLM(
        model,
        { messages, tools: allToolDefs.length > 0 ? allToolDefs : undefined },
        sendEvent,
        signal
      );

      if (signal.aborted) return;

      // 累计 usage
      if (result.usage) {
        totalUsage.inputTokens += result.usage.inputTokens;
        totalUsage.outputTokens += result.usage.outputTokens;
      }

      // 如果有 tool calls，需要执行并继续循环
      if (result.toolCalls && result.toolCalls.length > 0 && allToolDefs.length > 0) {
        // 持久化 assistant 消息（含 tool calls）
        if (conversationId) {
          await this.repo.appendMessage({
            id: uuidv4(),
            conversationId,
            role: "assistant",
            content: result.content,
            thinking: result.thinking ? { content: result.thinking } : undefined,
            toolCalls: result.toolCalls,
            createtime: Date.now(),
          });
        }

        // 将 assistant 消息加入上下文（带 toolCalls，供 provider 构建 tool_calls 字段）
        messages.push({ role: "assistant", content: result.content || "", toolCalls: result.toolCalls });

        // 通过 ToolRegistry 执行工具（内置工具直接执行，脚本工具回调 Sandbox）
        const toolResults = await this.toolRegistry.execute(result.toolCalls, scriptToolCallback);

        // 将 tool 结果加入消息
        for (const tr of toolResults) {
          messages.push({ role: "tool", content: tr.result, toolCallId: tr.id });
          // 持久化 tool 结果消息
          if (conversationId) {
            await this.repo.appendMessage({
              id: uuidv4(),
              conversationId,
              role: "tool",
              content: tr.result,
              toolCallId: tr.id,
              createtime: Date.now(),
            });
          }
        }

        // 继续循环
        continue;
      }

      // 没有 tool calls，对话结束
      if (conversationId) {
        await this.repo.appendMessage({
          id: uuidv4(),
          conversationId,
          role: "assistant",
          content: result.content,
          thinking: result.thinking ? { content: result.thinking } : undefined,
          createtime: Date.now(),
        });
      }

      // 发送 done 事件
      sendEvent({ type: "done", usage: totalUsage, durationMs: Date.now() - startTime });
      return;
    }

    // 超过最大迭代次数
    sendEvent({ type: "error", message: `Tool calling loop exceeded maximum iterations (${maxIterations})` });
  }

  // 统一的流式 conversation chat（UI 和脚本 API 共用）
  private async handleConversationChat(
    params: {
      conversationId: string;
      message: string;
      tools?: ToolDefinition[];
      maxIterations?: number;
      scriptUuid?: string;
      modelId?: string;
      // ephemeral 会话专用字段
      ephemeral?: boolean;
      messages?: ChatRequest["messages"];
      system?: string;
    },
    sender: IGetSender
  ) {
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("Conversation chat requires connect mode");
    }
    const msgConn = sender.getConnect()!;

    const abortController = new AbortController();
    let isDisconnected = false;

    msgConn.onDisconnect(() => {
      isDisconnected = true;
      abortController.abort();
    });

    const sendEvent = (event: ChatStreamEvent) => {
      if (!isDisconnected) {
        msgConn.sendMessage({ action: "event", data: event });
      }
    };

    // 构建脚本工具回调：通过 MessageConnect 让 Sandbox 执行 handler
    let toolResultResolve: ((results: Array<{ id: string; result: string }>) => void) | null = null;

    msgConn.onMessage((msg: any) => {
      if (msg.action === "toolResults" && toolResultResolve) {
        const resolve = toolResultResolve;
        toolResultResolve = null;
        resolve(msg.data);
      }
    });

    const scriptToolCallback: ScriptToolCallback = (toolCalls: ToolCall[]) => {
      return new Promise((resolve) => {
        toolResultResolve = resolve;
        msgConn.sendMessage({ action: "executeTools", data: toolCalls });
      });
    };

    try {
      // ephemeral 模式：无状态处理，不从 repo 加载/持久化
      if (params.ephemeral) {
        const model = await this.getModel(params.modelId);

        // 使用脚本传入的完整消息历史
        const messages: ChatRequest["messages"] = [];

        // 添加 system prompt
        if (params.system) {
          messages.push({ role: "system", content: params.system });
        }

        // 添加脚本端维护的消息历史（已含最新 user message）
        if (params.messages) {
          for (const msg of params.messages) {
            messages.push({
              role: msg.role,
              content: msg.content,
              toolCallId: msg.toolCallId,
              toolCalls: msg.toolCalls,
            });
          }
        }

        await this.callLLMWithToolLoop({
          model,
          messages,
          tools: params.tools,
          maxIterations: params.maxIterations || 20,
          sendEvent,
          signal: abortController.signal,
          scriptToolCallback: params.tools && params.tools.length > 0 ? scriptToolCallback : null,
          skipBuiltinTools: true,
        });
        return;
      }

      // 获取对话和模型
      const conv = await this.getConversation(params.conversationId);
      if (!conv) {
        sendEvent({ type: "error", message: "Conversation not found" });
        return;
      }

      // UI 传入 modelId 时覆盖 conversation 的 modelId
      if (params.modelId && params.modelId !== conv.modelId) {
        conv.modelId = params.modelId;
        conv.updatetime = Date.now();
        await this.repo.saveConversation(conv);
      }

      const model = await this.getModel(conv.modelId);

      // 解析 Skills（注入 prompt + 注册 meta-tools）
      const { promptSuffix, metaTools } = this.resolveSkills(conv.skills);

      // 临时注册 skill meta-tools（对话结束后清理）
      const registeredMetaToolNames: string[] = [];
      for (const mt of metaTools) {
        this.toolRegistry.registerBuiltin(mt.definition, mt.executor);
        registeredMetaToolNames.push(mt.definition.name);
      }

      // 加载历史消息
      const existingMessages = await this.repo.getMessages(params.conversationId);

      // 构建消息列表
      const messages: ChatRequest["messages"] = [];

      // 添加 system 消息（拼接 skill prompt）
      const systemContent = (conv.system || "") + promptSuffix;
      if (systemContent) {
        messages.push({ role: "system", content: systemContent });
      }

      // 添加历史消息（跳过 system）
      for (const msg of existingMessages) {
        if (msg.role === "system") continue;
        messages.push({
          role: msg.role,
          content: msg.content,
          toolCallId: msg.toolCallId,
          toolCalls: msg.toolCalls,
        });
      }

      // 添加新用户消息
      messages.push({ role: "user", content: params.message });

      // 持久化用户消息
      await this.repo.appendMessage({
        id: uuidv4(),
        conversationId: params.conversationId,
        role: "user",
        content: params.message,
        createtime: Date.now(),
      });

      // 更新对话标题（如果是第一条消息）
      if (existingMessages.length === 0 && conv.title === "New Chat") {
        conv.title = params.message.slice(0, 30) + (params.message.length > 30 ? "..." : "");
        conv.updatetime = Date.now();
        await this.repo.saveConversation(conv);
      }

      try {
        // 使用统一的 tool calling 循环
        await this.callLLMWithToolLoop({
          model,
          messages,
          tools: params.tools,
          maxIterations: params.maxIterations || 20,
          sendEvent,
          signal: abortController.signal,
          scriptToolCallback: params.tools && params.tools.length > 0 ? scriptToolCallback : null,
          conversationId: params.conversationId,
        });
      } finally {
        // 清理临时注册的 meta-tools
        for (const name of registeredMetaToolNames) {
          this.toolRegistry.unregisterBuiltin(name);
        }
      }
    } catch (e: any) {
      if (abortController.signal.aborted) return;
      sendEvent({ type: "error", message: e.message || "Unknown error" });
    }
  }

  // 调用 LLM 并收集完整响应（内部处理流式）
  private async callLLM(
    model: AgentModelConfig,
    params: { messages: ChatRequest["messages"]; tools?: ToolDefinition[] },
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<{ content: string; thinking?: string; toolCalls?: ToolCall[]; usage?: { inputTokens: number; outputTokens: number } }> {
    const chatRequest: ChatRequest = {
      conversationId: "",
      modelId: model.id,
      messages: params.messages,
      tools: params.tools,
    };

    const { url, init } =
      model.provider === "anthropic"
        ? buildAnthropicRequest(model, chatRequest)
        : buildOpenAIRequest(model, chatRequest);

    const response = await fetch(url, { ...init, signal });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let errorMessage = `API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
      } catch {
        if (errorText) errorMessage += ` - ${errorText.slice(0, 200)}`;
      }
      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const parseStream = model.provider === "anthropic" ? parseAnthropicStream : parseOpenAIStream;

    // 收集响应
    let content = "";
    let thinking = "";
    const toolCalls: ToolCall[] = [];
    let currentToolCall: ToolCall | null = null;
    let usage: { inputTokens: number; outputTokens: number } | undefined;

    return new Promise((resolve, reject) => {
      const onEvent = (event: ChatStreamEvent) => {
        // 只转发流式内容事件，done 和 error 由 callLLMWithToolLoop 统一管理
        // 避免在 tool calling 循环中提前发送 done 导致客户端过早 resolve
        if (event.type !== "done" && event.type !== "error") {
          sendEvent(event);
        }

        switch (event.type) {
          case "content_delta":
            content += event.delta;
            break;
          case "thinking_delta":
            thinking += event.delta;
            break;
          case "tool_call_start":
            currentToolCall = { ...event.toolCall, arguments: event.toolCall.arguments || "" };
            break;
          case "tool_call_delta":
            if (currentToolCall) {
              currentToolCall.arguments += event.delta;
            }
            break;
          case "done":
            // 保存当前的 tool call
            if (currentToolCall) {
              toolCalls.push(currentToolCall);
              currentToolCall = null;
            }
            if (event.usage) {
              usage = event.usage;
            }
            resolve({
              content,
              thinking: thinking || undefined,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              usage,
            });
            break;
          case "error":
            reject(new Error(event.message));
            break;
        }
      };

      parseStream(reader, onEvent, signal).catch(reject);
    });
  }
}
