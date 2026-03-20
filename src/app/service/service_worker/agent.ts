import type { Group, IGetSender } from "@Packages/message/server";
import { GetSenderType } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import type {
  AgentModelConfig,
  AgentModelSafeConfig,
  ChatRequest,
  ChatStreamEvent,
  ConversationApiRequest,
  Conversation,
  ToolCall,
  ToolDefinition,
  DomApiRequest,
  SkillApiRequest,
  SkillMetadata,
  SkillRecord,
  SkillSummary,
  SkillScriptRecord,
  MessageContent,
  AgentTask,
  AgentTaskApiRequest,
  AgentTaskTrigger,
  Attachment,
  ModelApiRequest,
  OPFSApiRequest,
  MCPApiRequest,
  ContentBlock,
} from "@App/app/service/agent/types";
import { getTextContent, isContentBlocks } from "@App/app/service/agent/content_utils";
import { supportsVision, supportsImageOutput } from "@App/pages/options/routes/AgentChat/model_utils";
import { buildOpenAIRequest, parseOpenAIStream } from "@App/app/service/agent/providers/openai";
import { buildAnthropicRequest, parseAnthropicStream } from "@App/app/service/agent/providers/anthropic";
import { AgentChatRepo } from "@App/app/repo/agent_chat";
import { AgentModelRepo } from "@App/app/repo/agent_model";
import { SkillRepo } from "@App/app/repo/skill_repo";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { ToolRegistry } from "@App/app/service/agent/tool_registry";
import type { ScriptToolCallback, ToolExecutor } from "@App/app/service/agent/tool_registry";
import { parseSkillScriptMetadata } from "@App/pkg/utils/skill_script";
import { parseSkillMd, parseSkillZip } from "@App/pkg/utils/skill";
import { SkillScriptExecutor, SKILL_SCRIPT_UUID_PREFIX } from "@App/app/service/agent/skill_script_executor";
import { CACHE_KEY_SKILL_INSTALL } from "@App/app/cache_key";
import { buildSystemPrompt, SKILL_SUFFIX_HEADER } from "@App/app/service/agent/system_prompt";
import { COMPACT_SYSTEM_PROMPT, buildCompactUserPrompt, extractSummary } from "@App/app/service/agent/compact_prompt";
import { getContextWindow } from "@App/app/service/agent/model_context";
import { cacheInstance } from "@App/app/cache";
import { AgentDomService } from "./agent_dom";
import { MCPService } from "./agent_mcp";
import { type ResourceService } from "./resource";
import { AgentTaskRepo, AgentTaskRunRepo } from "@App/app/repo/agent_task";
import { AgentTaskScheduler } from "@App/app/service/agent/task_scheduler";
import { InfoNotification } from "./utils";
import { nextTimeInfo } from "@App/pkg/utils/cron";
import { sendMessage } from "@Packages/message/client";
import { WEB_FETCH_DEFINITION, WebFetchExecutor } from "@App/app/service/agent/tools/web_fetch";
import { WEB_SEARCH_DEFINITION, WebSearchExecutor } from "@App/app/service/agent/tools/web_search";
import { SearchConfigRepo, type SearchEngineConfig } from "@App/app/service/agent/tools/search_config";
import { createTaskTools } from "@App/app/service/agent/tools/task_tools";
import { createAskUserTool } from "@App/app/service/agent/tools/ask_user";
import { createSubAgentTool } from "@App/app/service/agent/tools/sub_agent";
import { createOPFSTools, setCreateBlobUrlFn, guessMimeType } from "@App/app/service/agent/tools/opfs_tools";
import { sanitizePath, getWorkspaceRoot, getDirectory, splitPath } from "@App/app/service/agent/opfs_helpers";
import { createObjectURL } from "@App/app/service/offscreen/client";
import { createExecuteScriptTool } from "@App/app/service/agent/tools/execute_script";
import { executeSkillScript } from "@App/app/service/offscreen/client";
import { createTabTools } from "@App/app/service/agent/tools/tab_tools";

// 判断是否可重试（429 / 5xx / 网络错误，不含 4xx 客户端错误）
export function isRetryableError(e: Error): boolean {
  const msg = e.message;
  return /429|5\d\d|network|fetch|ECONNRESET/i.test(msg) && !/40[0134]/.test(msg);
}

// 指数退避重试，aborted 时立即退出
// delayFn 仅供测试注入，生产代码不传
export async function withRetry<T>(
  fn: () => Promise<T>,
  signal: AbortSignal,
  maxRetries = 3,
  delayFn?: (ms: number, signal: AbortSignal) => Promise<void>
): Promise<T> {
  const wait =
    delayFn ??
    ((ms, sig) =>
      new Promise<void>((r) => {
        const t = setTimeout(r, ms);
        sig.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            r();
          },
          { once: true }
        );
      }));

  let lastError!: Error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) throw lastError ?? new Error("Aborted");
    try {
      return await fn();
    } catch (e: any) {
      if (signal.aborted) throw e;
      lastError = e;
      if (!isRetryableError(e) || attempt === maxRetries) throw e;
      const delay = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
      await wait(delay, signal);
    }
  }
  throw lastError;
}

// 将 Error 分类为 errorCode 字符串
export function classifyErrorCode(e: Error): string {
  const msg = e.message;
  if (/429/.test(msg)) return "rate_limit";
  if (/401|403/.test(msg)) return "auth";
  if (/timed out/.test(msg) || (e as any).errorCode === "tool_timeout") return "tool_timeout";
  return "api_error";
}

// 后台运行会话的 listener 条目
type ListenerEntry = {
  sendEvent: (event: ChatStreamEvent) => void;
};

// 后台运行会话状态
type RunningConversation = {
  conversationId: string;
  abortController: AbortController;
  listeners: Set<ListenerEntry>;
  streamingState: { content: string; thinking: string; toolCalls: ToolCall[] };
  pendingAskUser?: { id: string; question: string; options?: string[]; multiple?: boolean };
  askResolvers: Map<string, (answer: string) => void>;
  tasks: Array<{ id: string; subject: string; status: "pending" | "in_progress" | "completed"; description?: string }>;
  status: "running" | "done" | "error";
};

export class AgentService {
  private repo = new AgentChatRepo();
  private skillRepo = new SkillRepo();
  private toolRegistry = new ToolRegistry();
  // 已加载的 Skill 缓存
  private skillCache = new Map<string, SkillRecord>();

  private modelRepo = new AgentModelRepo();
  private domService = new AgentDomService();
  private mcpService!: MCPService;
  private taskRepo = new AgentTaskRepo();
  private taskRunRepo = new AgentTaskRunRepo();
  private taskScheduler!: AgentTaskScheduler;
  private searchConfigRepo = new SearchConfigRepo();
  // 后台运行的会话注册表
  private runningConversations = new Map<string, RunningConversation>();

  constructor(
    private group: Group,
    private sender: MessageSend,
    private resourceService?: ResourceService
  ) {}

  handleDomApi(request: DomApiRequest): Promise<unknown> {
    return this.domService.handleDomApi(request);
  }

  init() {
    // 注入 chatRepo 到 ToolRegistry 用于保存附件
    this.toolRegistry.setChatRepo(this.repo);
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
    this.group.on(
      "setSkillEnabled",
      (params: { name: string; enabled: boolean }) => this.setSkillEnabled(params.name, params.enabled)
    );
    this.group.on("getSkillConfigValues", (name: string) => this.skillRepo.getConfigValues(name));
    this.group.on("saveSkillConfig", (params: { name: string; values: Record<string, unknown> }) =>
      this.skillRepo.saveConfigValues(params.name, params.values)
    );
    // Skill ZIP 安装页面相关消息
    this.group.on("prepareSkillInstall", (zipBase64: string) => this.prepareSkillInstall(zipBase64));
    this.group.on("getSkillInstallData", (uuid: string) => this.getSkillInstallData(uuid));
    this.group.on("completeSkillInstall", (uuid: string) => this.completeSkillInstall(uuid));
    this.group.on("cancelSkillInstall", (uuid: string) => this.cancelSkillInstall(uuid));
    // Model CRUD（供 Options UI 调用）
    this.group.on("listModels", () => this.modelRepo.listModels());
    this.group.on("getModel", (id: string) => this.modelRepo.getModel(id));
    this.group.on("saveModel", (model: AgentModelConfig) => this.modelRepo.saveModel(model));
    this.group.on("removeModel", (id: string) => this.modelRepo.removeModel(id));
    this.group.on("getDefaultModelId", () => this.modelRepo.getDefaultModelId());
    this.group.on("setDefaultModelId", (id: string) => this.modelRepo.setDefaultModelId(id));
    // MCP API（供 Options UI 调用，复用已有的 handleMCPApi）
    this.group.on("mcpApi", (request: MCPApiRequest) => this.mcpService.handleMCPApi(request));
    // Agent 定时任务 API
    this.group.on("agentTask", this.handleAgentTask.bind(this));
    // 初始化定时任务调度器
    this.taskScheduler = new AgentTaskScheduler(
      this.taskRepo,
      this.taskRunRepo,
      (task) => this.executeInternalTask(task),
      (task) => this.emitTaskEvent(task)
    );
    this.taskScheduler.init();
    // 摘要模型 & 搜索配置 API（供 Options UI 调用）
    this.group.on("getSummaryModelId", () => this.modelRepo.getSummaryModelId());
    this.group.on("setSummaryModelId", (id: string) => this.modelRepo.setSummaryModelId(id));
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
    this.loadSkills();
  }

  // 获取工具注册表（供外部注册内置工具）
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  // 创建 require 资源加载器，从 ResourceDAO 缓存中读取已下载的资源内容
  private createRequireLoader(): ((url: string) => Promise<string | undefined>) | undefined {
    if (!this.resourceService) return undefined;
    const rs = this.resourceService;
    return async (url: string) => {
      const res = await rs.getResource("skillscript-require", url, "require", false);
      return res?.content as string | undefined;
    };
  }

  // ---- Skill 管理 ----

  // 从 OPFS 加载所有 Skill 到缓存
  private async loadSkills() {
    try {
      const summaries = await this.skillRepo.listSkills();
      for (const summary of summaries) {
        const record = await this.skillRepo.getSkill(summary.name);
        if (record) {
          // 从 registry 同步 enabled 状态到缓存
          if (summary.enabled !== undefined) {
            record.enabled = summary.enabled;
          }
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

    // 解析 SkillScript 脚本
    const toolRecords: SkillScriptRecord[] = [];
    const toolNames: string[] = [];
    if (scripts) {
      for (const script of scripts) {
        const metadata = parseSkillScriptMetadata(script.code);
        if (!metadata) {
          throw new Error(`Invalid SkillScript "${script.name}": missing ==SkillScript== header`);
        }
        // 下载并缓存 @require 资源
        if (metadata.requires.length > 0 && this.resourceService) {
          const dummyUuid = "skillscript-require";
          await Promise.all(
            metadata.requires.map((url) => this.resourceService!.getResource(dummyUuid, url, "require", true))
          );
        }
        toolNames.push(metadata.name);
        const now = Date.now();
        toolRecords.push({
          id: uuidv4(),
          name: metadata.name,
          description: metadata.description,
          params: metadata.params,
          grants: metadata.grants,
          requires: metadata.requires.length > 0 ? metadata.requires : undefined,
          timeout: metadata.timeout,
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
      ...(parsed.metadata.config ? { config: parsed.metadata.config } : {}),
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

  // 刷新单个 Skill 缓存（从 OPFS 重新加载）
  async refreshSkill(name: string): Promise<boolean> {
    const record = await this.skillRepo.getSkill(name);
    if (record) {
      this.skillCache.set(record.name, record);
      return true;
    }
    this.skillCache.delete(name);
    return false;
  }

  // 启用/禁用 Skill
  async setSkillEnabled(name: string, enabled: boolean): Promise<boolean> {
    return this.skillRepo.setSkillEnabled(name, enabled);
  }

  // 缓存 Skill ZIP 数据，返回 uuid，供安装页面获取
  async prepareSkillInstall(zipBase64: string): Promise<string> {
    const uuid = uuidv4();
    await cacheInstance.set(CACHE_KEY_SKILL_INSTALL + uuid, zipBase64);
    return uuid;
  }

  // 获取缓存的 Skill ZIP 数据并解析
  async getSkillInstallData(uuid: string): Promise<{
    skillMd: string;
    metadata: SkillMetadata;
    prompt: string;
    scripts: Array<{ name: string; code: string }>;
    references: Array<{ name: string; content: string }>;
    isUpdate: boolean;
  }> {
    const zipBase64 = await cacheInstance.get<string>(CACHE_KEY_SKILL_INSTALL + uuid);
    if (!zipBase64) {
      throw new Error("Skill install data not found or expired");
    }
    // base64 → ArrayBuffer
    const binaryStr = atob(zipBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const buffer = bytes.buffer;

    const result = await parseSkillZip(buffer);
    const parsed = parseSkillMd(result.skillMd);
    if (!parsed) {
      throw new Error("Invalid SKILL.md format in ZIP");
    }
    // 检查是否为更新
    const existing = await this.skillRepo.getSkill(parsed.metadata.name);
    return {
      skillMd: result.skillMd,
      metadata: parsed.metadata,
      prompt: parsed.prompt,
      scripts: result.scripts,
      references: result.references,
      isUpdate: !!existing,
    };
  }

  // Skill 安装页面确认安装
  async completeSkillInstall(uuid: string): Promise<SkillRecord> {
    const data = await this.getSkillInstallData(uuid);
    const record = await this.installSkill(data.skillMd, data.scripts, data.references);
    await cacheInstance.del(CACHE_KEY_SKILL_INSTALL + uuid);
    return record;
  }

  // Skill 安装页面取消
  async cancelSkillInstall(uuid: string): Promise<void> {
    await cacheInstance.del(CACHE_KEY_SKILL_INSTALL + uuid);
  }

  // 处理 CAT.agent.skills API 请求
  async handleSkillsApi(request: SkillApiRequest): Promise<SkillSummary[] | SkillRecord | null | boolean | unknown> {
    switch (request.action) {
      case "list":
        return this.skillRepo.listSkills();
      case "get":
        return this.skillRepo.getSkill(request.name);
      case "install":
        return this.installSkill(request.skillMd, request.scripts, request.references);
      case "remove":
        return this.removeSkill(request.name);
      case "call": {
        const { skillName, scriptName, params } = request;
        const skillRecord = await this.skillRepo.getSkill(skillName);
        if (!skillRecord) {
          throw new Error(`Skill "${skillName}" not found`);
        }
        const scripts = await this.skillRepo.getSkillScripts(skillName);
        const script = scripts.find((s) => s.name === scriptName);
        if (!script) {
          throw new Error(`Script "${scriptName}" not found in skill "${skillName}"`);
        }
        const configValues = skillRecord.config ? await this.skillRepo.getConfigValues(skillName) : undefined;
        const executor = new SkillScriptExecutor(script, this.sender, this.createRequireLoader(), configValues);
        return executor.execute(params || {});
      }
      default:
        throw new Error(`Unknown skills action: ${(request as any).action}`);
    }
  }

  // 处理 CAT.agent.opfs API 请求
  // sender.getSender() 有值 → 来自 chrome.runtime（content script），不支持 Blob
  // sender.getSender() 为空 → 来自 postMessage（offscreen），支持 Blob
  async handleOPFSApi(request: OPFSApiRequest, sender: IGetSender): Promise<unknown> {
    const supportBlob = !sender.getSender();
    const opfsTools = createOPFSTools();
    const toolMap = new Map(opfsTools.tools.map((t) => [t.definition.name, t.executor]));

    switch (request.action) {
      case "write": {
        let content = request.content;
        // chrome.runtime 通道：content script 已将 Blob 转为 blob URL，需还原
        if (!supportBlob && typeof content === "string" && content.startsWith("blob:")) {
          content = await this.fetchBlobFromOffscreen(content);
        }
        const executor = toolMap.get("opfs_write")!;
        return JSON.parse((await executor.execute({ path: request.path, content })) as string);
      }
      case "read": {
        if (request.format === "blob") {
          const safePath = sanitizePath(request.path);
          if (!safePath) throw new Error("path is required");
          const workspace = await getWorkspaceRoot();
          const { dirPath, fileName } = splitPath(safePath);
          const dir = dirPath ? await getDirectory(workspace, dirPath) : workspace;
          const fileHandle = await dir.getFileHandle(fileName);
          const file = await fileHandle.getFile();
          const mimeType = guessMimeType(safePath);
          const blob = new Blob([await file.arrayBuffer()], { type: mimeType });
          if (supportBlob) {
            // postMessage 通道：直接返回 Blob
            return { path: safePath, data: blob, size: file.size, mimeType };
          }
          // chrome.runtime 通道：通过 offscreen 创建 blob URL，客户端通过 CAT_fetchBlob 还原
          const blobUrl = (await createObjectURL(this.sender, { blob, persistence: true })) as string;
          return { path: safePath, blobUrl, size: file.size, mimeType };
        }
        // 默认 text 模式：直接返回文件文本内容（不走 opfs_read executor，因其一律返回 blobUrl）
        const safePath2 = sanitizePath(request.path);
        if (!safePath2) throw new Error("path is required");
        const workspace2 = await getWorkspaceRoot();
        const { dirPath: dirPath2, fileName: fileName2 } = splitPath(safePath2);
        const dir2 = dirPath2 ? await getDirectory(workspace2, dirPath2) : workspace2;
        const fileHandle2 = await dir2.getFileHandle(fileName2);
        const file2 = await fileHandle2.getFile();
        const textContent = await file2.text();
        return { path: safePath2, content: textContent, size: file2.size };
      }
      case "readAttachment": {
        const blob = await this.repo.getAttachment(request.id);
        if (!blob) {
          throw new Error(`Attachment not found: ${request.id}`);
        }
        if (supportBlob) {
          // postMessage 通道：直接返回 Blob
          return { id: request.id, data: blob, size: blob.size, mimeType: blob.type };
        }
        // chrome.runtime 通道：通过 offscreen 创建 blob URL，客户端通过 CAT_fetchBlob 还原
        const blobUrl = (await createObjectURL(this.sender, { blob, persistence: true })) as string;
        return { id: request.id, blobUrl, size: blob.size, mimeType: blob.type };
      }
      case "list": {
        const executor = toolMap.get("opfs_list")!;
        return JSON.parse((await executor.execute({ path: request.path || "" })) as string);
      }
      case "delete": {
        const executor = toolMap.get("opfs_delete")!;
        return JSON.parse((await executor.execute({ path: request.path })) as string);
      }
      default:
        throw new Error(`Unknown OPFS action: ${(request as any).action}`);
    }
  }

  // 通过 offscreen fetch blob URL 还原为 Blob（用于 chrome.runtime 通道下 content script 传来的 blob URL）
  private async fetchBlobFromOffscreen(blobUrl: string): Promise<Blob> {
    return (await sendMessage(this.sender, "offscreen/fetchBlob", { url: blobUrl })) as Blob;
  }

  // 解析对话关联的 skills，返回 system prompt 附加内容和 meta-tool 定义
  // 两层渐进加载：1) system prompt 只注入摘要 2) load_skill 按需加载完整提示词及脚本描述
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
      // auto 模式只加载已启用的 skill（enabled 为 undefined 视为启用）
      skillRecords = Array.from(this.skillCache.values()).filter((r) => r.enabled !== false);
    } else {
      // 显式指定名称时不过滤 enabled 状态
      skillRecords = skills.map((name) => this.skillCache.get(name)).filter((r): r is SkillRecord => r != null);
    }

    if (skillRecords.length === 0) {
      return { promptSuffix: "", metaTools: [] };
    }

    // 构建 prompt 后缀：只包含 name + description 摘要
    const promptParts: string[] = [SKILL_SUFFIX_HEADER];

    // 检查是否有任何参考资料
    let hasReferences = false;

    for (const skill of skillRecords) {
      const toolHint = skill.toolNames.length > 0 ? ` (scripts: ${skill.toolNames.join(", ")})` : "";
      const refHint = skill.referenceNames.length > 0 ? ` [has references]` : "";
      promptParts.push(`- **${skill.name}**: ${skill.description || "(no description)"}${toolHint}${refHint}`);
      if (skill.referenceNames.length > 0) hasReferences = true;
    }

    // 构建 meta-tools
    const metaTools: Array<{ definition: ToolDefinition; executor: ToolExecutor }> = [];

    // 已加载的 skill 名，避免重复加载
    const loadedSkills = new Set<string>();

    // load_skill — 始终注册
    metaTools.push({
      definition: {
        name: "load_skill",
        description:
          "Load a skill's full instructions. MUST be called before using any skill. Returns the skill's detailed prompt and a description of available scripts that can be executed via `execute_skill_script`.",
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
          if (loadedSkills.has(skillName)) {
            return record.prompt;
          }
          loadedSkills.add(skillName);
          // 拼接脚本描述到 prompt（供 LLM 了解可用脚本及参数）
          let prompt = record.prompt;
          if (record.toolNames.length > 0) {
            const toolRecords = await this.skillRepo.getSkillScripts(skillName);
            if (toolRecords.length > 0) {
              prompt += "\n\n## Available Scripts\n\nUse `execute_skill_script` to run these scripts:\n";
              for (const tool of toolRecords) {
                prompt += `\n### ${tool.name}\n${tool.description}\n`;
                if (tool.params.length > 0) {
                  prompt += "\nParameters:\n";
                  for (const p of tool.params) {
                    const req = p.required ? " (required)" : "";
                    const enumStr = p.enum ? ` [${p.enum.join(", ")}]` : "";
                    prompt += `- \`${p.name}\` (${p.type}${enumStr})${req}: ${p.description}\n`;
                  }
                }
              }
            }
          }
          return prompt;
        },
      },
    });

    // execute_skill_script — 始终注册
    metaTools.push({
      definition: {
        name: "execute_skill_script",
        description: "Execute a script belonging to a loaded skill. The skill must be loaded first via `load_skill`.",
        parameters: {
          type: "object",
          properties: {
            skill: { type: "string", description: "Name of the skill that owns the script" },
            script: { type: "string", description: "Name of the script to execute" },
            params: {
              type: "object",
              description: "Parameters to pass to the script (as defined in the script's metadata)",
            },
          },
          required: ["skill", "script"],
        },
      },
      executor: {
        execute: async (args: Record<string, unknown>) => {
          const skillName = args.skill as string;
          const scriptName = args.script as string;
          const params = (args.params || {}) as Record<string, unknown>;
          if (!loadedSkills.has(skillName)) {
            throw new Error(`Skill "${skillName}" is not loaded. Call load_skill first.`);
          }
          const toolRecords = await this.skillRepo.getSkillScripts(skillName);
          const scriptRecord = toolRecords.find((t) => t.name === scriptName);
          if (!scriptRecord) {
            throw new Error(`Script "${scriptName}" not found in skill "${skillName}"`);
          }
          const configValues = this.skillCache.get(skillName)?.config
            ? await this.skillRepo.getConfigValues(skillName)
            : undefined;
          const executor = new SkillScriptExecutor(scriptRecord, this.sender, this.createRequireLoader(), configValues);
          return executor.execute(params);
        },
      },
    });

    // read_reference — 有参考资料时才注册
    if (hasReferences) {
      metaTools.push({
        definition: {
          name: "read_reference",
          description:
            "Read a reference document belonging to a skill (e.g. API docs, examples). The skill must be loaded first via `load_skill`.",
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

  // 定时任务调度器 tick，由 alarm handler 调用
  async onSchedulerTick() {
    await this.taskScheduler.tick();
  }

  // 处理定时任务 API 请求
  private async handleAgentTask(params: AgentTaskApiRequest) {
    switch (params.action) {
      case "list":
        return this.taskRepo.listTasks();
      case "get":
        return this.taskRepo.getTask(params.id);
      case "create": {
        const now = Date.now();
        const task: AgentTask = {
          ...params.task,
          id: uuidv4(),
          createtime: now,
          updatetime: now,
        };
        // 计算 nextruntime
        if (task.enabled) {
          try {
            const info = nextTimeInfo(task.crontab);
            task.nextruntime = info.next.toMillis();
          } catch {
            // cron 无效，不设置 nextruntime
          }
        }
        await this.taskRepo.saveTask(task);
        return task;
      }
      case "update": {
        const existing = await this.taskRepo.getTask(params.id);
        if (!existing) throw new Error("Task not found");
        const updated = { ...existing, ...params.task, updatetime: Date.now() };
        // 如果 crontab 或 enabled 变化，重新计算 nextruntime
        if (params.task.crontab !== undefined || params.task.enabled !== undefined) {
          if (updated.enabled) {
            try {
              const info = nextTimeInfo(updated.crontab);
              updated.nextruntime = info.next.toMillis();
            } catch {
              updated.nextruntime = undefined;
            }
          }
        }
        await this.taskRepo.saveTask(updated);
        return updated;
      }
      case "delete":
        await this.taskRepo.removeTask(params.id);
        return true;
      case "enable": {
        const task = await this.taskRepo.getTask(params.id);
        if (!task) throw new Error("Task not found");
        task.enabled = params.enabled;
        task.updatetime = Date.now();
        if (task.enabled) {
          try {
            const info = nextTimeInfo(task.crontab);
            task.nextruntime = info.next.toMillis();
          } catch {
            task.nextruntime = undefined;
          }
        }
        await this.taskRepo.saveTask(task);
        return task;
      }
      case "runNow": {
        const task = await this.taskRepo.getTask(params.id);
        if (!task) throw new Error("Task not found");
        // 不 await，立即返回
        this.taskScheduler.executeTask(task).catch(() => {});
        return true;
      }
      case "listRuns":
        return this.taskRunRepo.listRuns(params.taskId, params.limit);
      case "clearRuns":
        await this.taskRunRepo.clearRuns(params.taskId);
        return true;
      default:
        throw new Error(`Unknown agentTask action: ${(params as any).action}`);
    }
  }

  // internal 模式定时任务执行：构建对话并调用 LLM
  private async executeInternalTask(
    task: AgentTask
  ): Promise<{ conversationId: string; usage?: { inputTokens: number; outputTokens: number } }> {
    const model = await this.getModel(task.modelId);

    // 解析 Skills
    const { promptSuffix, metaTools } = this.resolveSkills(task.skills);

    // 临时注册 skill meta-tools
    const registeredMetaToolNames: string[] = [];
    for (const mt of metaTools) {
      this.toolRegistry.registerBuiltin(mt.definition, mt.executor);
      registeredMetaToolNames.push(mt.definition.name);
    }

    try {
      let conversationId: string;
      const messages: ChatRequest["messages"] = [];

      if (task.conversationId) {
        // 续接已有对话
        conversationId = task.conversationId;
        const conv = await this.getConversation(conversationId);

        const systemContent = buildSystemPrompt({
          userSystem: conv?.system,
          skillSuffix: promptSuffix,
        });
        messages.push({ role: "system", content: systemContent });

        // 加载历史消息
        if (conv) {
          const existingMessages = await this.repo.getMessages(conversationId);

          // 预加载之前已加载的 skill 的工具
          if (metaTools.length > 0) {
            const loadSkillMeta = metaTools.find((mt) => mt.definition.name === "load_skill");
            if (loadSkillMeta) {
              for (const msg of existingMessages) {
                if (msg.role === "assistant" && msg.toolCalls) {
                  for (const tc of msg.toolCalls) {
                    if (tc.name === "load_skill") {
                      try {
                        const args = JSON.parse(tc.arguments || "{}");
                        if (args.skill_name) {
                          await loadSkillMeta.executor.execute({ skill_name: args.skill_name });
                        }
                      } catch {
                        // 跳过
                      }
                    }
                  }
                }
              }
            }
          }

          for (const msg of existingMessages) {
            if (msg.role === "system") continue;
            messages.push({
              role: msg.role,
              content: msg.content,
              toolCallId: msg.toolCallId,
              toolCalls: msg.toolCalls,
            });
          }
        }
      } else {
        // 创建新对话
        conversationId = uuidv4();
        const conv: Conversation = {
          id: conversationId,
          title: task.name,
          modelId: model.id,
          skills: task.skills,
          createtime: Date.now(),
          updatetime: Date.now(),
        };
        await this.repo.saveConversation(conv);

        const systemContent = buildSystemPrompt({ skillSuffix: promptSuffix });
        messages.push({ role: "system", content: systemContent });
      }

      // 添加用户消息（task.prompt）
      const userContent = task.prompt || task.name;
      messages.push({ role: "user", content: userContent });
      await this.repo.appendMessage({
        id: uuidv4(),
        conversationId,
        role: "user",
        content: userContent,
        createtime: Date.now(),
      });

      // 收集 usage
      const totalUsage = { inputTokens: 0, outputTokens: 0 };
      const abortController = new AbortController();

      const sendEvent = (event: ChatStreamEvent) => {
        // 定时任务无 UI 连接，但需要收集 usage
        if (event.type === "done" && event.usage) {
          totalUsage.inputTokens += event.usage.inputTokens;
          totalUsage.outputTokens += event.usage.outputTokens;
        }
      };

      await this.callLLMWithToolLoop({
        model,
        messages,
        maxIterations: task.maxIterations || 10,
        sendEvent,
        signal: abortController.signal,
        scriptToolCallback: null,
        conversationId,
      });

      // 通知
      if (task.notify) {
        InfoNotification(task.name, "定时任务执行完成");
      }

      return { conversationId, usage: totalUsage };
    } finally {
      // 清理临时注册的 meta-tools
      for (const name of registeredMetaToolNames) {
        this.toolRegistry.unregisterBuiltin(name);
      }
    }
  }

  // event 模式定时任务：通知脚本
  private async emitTaskEvent(task: AgentTask): Promise<void> {
    if (!task.sourceScriptUuid) {
      throw new Error("Event mode task missing sourceScriptUuid");
    }

    const trigger: AgentTaskTrigger = {
      taskId: task.id,
      name: task.name,
      crontab: task.crontab,
      triggeredAt: Date.now(),
    };

    // 通过 offscreen → sandbox → 脚本 EventEmitter 链路通知脚本
    await sendMessage(this.sender, "offscreen/runtime/emitEvent", {
      uuid: task.sourceScriptUuid,
      event: "agentTask",
      eventId: task.id,
      data: trigger,
    });

    if (task.notify) {
      InfoNotification(task.name, "定时任务已触发");
    }
  }

  // 处理 conversation API 请求（非流式），供 GMApi 调用
  async handleConversationApi(params: ConversationApiRequest) {
    return this.handleConversation(params);
  }

  // 处理定时任务 API 请求，供 GMApi 调用
  async handleAgentTaskApi(params: AgentTaskApiRequest) {
    return this.handleAgentTask(params);
  }

  // 处理 CAT.agent.model API 请求（只读，隐藏 apiKey），供 GMApi 调用
  // 同时补充 supportsVision / supportsImageOutput 的自动检测 fallback，
  // 避免用户未手动勾选时脚本端拿到 undefined
  private stripApiKey(model: AgentModelConfig): AgentModelSafeConfig {
    const { apiKey: _, ...safe } = model;
    safe.supportsVision = supportsVision(model);
    safe.supportsImageOutput = supportsImageOutput(model);
    return safe;
  }

  async handleModelApi(
    request: ModelApiRequest
  ): Promise<AgentModelSafeConfig[] | AgentModelSafeConfig | null | string> {
    switch (request.action) {
      case "list": {
        const models = await this.modelRepo.listModels();
        return models.map((m) => this.stripApiKey(m));
      }
      case "get": {
        const model = await this.modelRepo.getModel(request.id);
        return model ? this.stripApiKey(model) : null;
      }
      case "getDefault":
        return this.modelRepo.getDefaultModelId();
      case "getSummary":
        return this.modelRepo.getSummaryModelId();
      default:
        throw new Error(`Unknown model API action: ${(request as any).action}`);
    }
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

  // 更新后台会话的流式状态快照
  private updateStreamingState(rc: RunningConversation, event: ChatStreamEvent) {
    switch (event.type) {
      case "content_delta":
        rc.streamingState.content += event.delta;
        break;
      case "thinking_delta":
        rc.streamingState.thinking += event.delta;
        break;
      case "tool_call_start":
        rc.streamingState.toolCalls.push({ ...event.toolCall, status: "running" });
        break;
      case "tool_call_delta":
        if (rc.streamingState.toolCalls.length > 0) {
          const last = rc.streamingState.toolCalls[rc.streamingState.toolCalls.length - 1];
          last.arguments += event.delta;
        }
        break;
      case "tool_call_complete": {
        const tc = rc.streamingState.toolCalls.find((t) => t.id === event.id);
        if (tc) {
          tc.status = "completed";
          tc.result = event.result;
          tc.attachments = event.attachments;
        }
        break;
      }
      case "new_message":
        // 新一轮 LLM 调用，重置流式状态
        rc.streamingState = { content: "", thinking: "", toolCalls: [] };
        break;
      case "ask_user":
        rc.pendingAskUser = {
          id: event.id,
          question: event.question,
          options: event.options,
          multiple: event.multiple,
        };
        break;
      case "task_update":
        rc.tasks = event.tasks;
        break;
      case "done":
        rc.status = "done";
        rc.pendingAskUser = undefined;
        break;
      case "error":
        rc.status = "error";
        rc.pendingAskUser = undefined;
        break;
    }
  }

  // 广播事件到所有 listener
  private broadcastEvent(rc: RunningConversation, event: ChatStreamEvent) {
    for (const listener of rc.listeners) {
      try {
        listener.sendEvent(event);
      } catch {
        // listener 断开，忽略
      }
    }
  }

  // 获取正在运行的会话 ID 列表
  getRunningConversationIds(): string[] {
    return Array.from(this.runningConversations.keys());
  }

  // 附加到后台运行中的会话
  private async handleAttachToConversation(params: { conversationId: string }, sender: IGetSender) {
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("attachToConversation requires connect mode");
    }
    const msgConn = sender.getConnect()!;

    const rc = this.runningConversations.get(params.conversationId);

    const sendEvent = (event: ChatStreamEvent) => {
      msgConn.sendMessage({ action: "event", data: event });
    };

    if (!rc) {
      // 会话不在运行中
      sendEvent({ type: "sync", tasks: [], status: "done" });
      return;
    }

    // 发送 sync 快照
    const syncEvent: ChatStreamEvent = {
      type: "sync",
      streamingMessage:
        rc.streamingState.content || rc.streamingState.thinking || rc.streamingState.toolCalls.length > 0
          ? {
              content: rc.streamingState.content,
              thinking: rc.streamingState.thinking || undefined,
              toolCalls: rc.streamingState.toolCalls,
            }
          : undefined,
      pendingAskUser: rc.pendingAskUser,
      tasks: rc.tasks,
      status: rc.status,
    };
    sendEvent(syncEvent);

    // 已完成则不需要添加 listener
    if (rc.status !== "running") {
      return;
    }

    // 添加 listener
    const listener: ListenerEntry = { sendEvent };
    rc.listeners.add(listener);

    // 处理来自 UI 的消息
    msgConn.onMessage((msg: any) => {
      if (msg.action === "askUserResponse" && msg.data) {
        const resolver = rc.askResolvers.get(msg.data.id);
        if (resolver) {
          rc.askResolvers.delete(msg.data.id);
          rc.pendingAskUser = undefined;
          resolver(msg.data.answer);
        }
      }
      if (msg.action === "stop") {
        rc.abortController.abort();
      }
    });

    msgConn.onDisconnect(() => {
      rc.listeners.delete(listener);
    });
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
    // 排除的工具名称列表（子代理不可用 ask_user、agent）
    excludeTools?: string[];
    // 是否启用 prompt caching，默认 true
    cache?: boolean;
    // 仅供测试注入，跳过重试延迟
    delayFn?: (ms: number, signal: AbortSignal) => Promise<void>;
  }): Promise<void> {
    const { model, messages, tools, maxIterations, sendEvent, signal, scriptToolCallback, conversationId } = params;

    const startTime = Date.now();
    let iterations = 0;
    const totalUsage = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };

    while (iterations < maxIterations) {
      iterations++;

      // 每轮重新获取工具定义（load_skill 可能动态注册了新工具）
      let allToolDefs = params.skipBuiltinTools ? tools || [] : this.toolRegistry.getDefinitions(tools);
      if (params.excludeTools && params.excludeTools.length > 0) {
        const excludeSet = new Set(params.excludeTools);
        allToolDefs = allToolDefs.filter((t) => !excludeSet.has(t.name));
      }

      // 调用 LLM（带指数退避重试）
      const result = await withRetry(
        () =>
          this.callLLM(
            model,
            { messages, tools: allToolDefs.length > 0 ? allToolDefs : undefined, cache: params.cache },
            sendEvent,
            signal
          ),
        signal,
        undefined,
        params.delayFn
      );

      if (signal.aborted) return;

      // 累计 usage
      if (result.usage) {
        totalUsage.inputTokens += result.usage.inputTokens;
        totalUsage.outputTokens += result.usage.outputTokens;
        totalUsage.cacheCreationInputTokens += result.usage.cacheCreationInputTokens || 0;
        totalUsage.cacheReadInputTokens += result.usage.cacheReadInputTokens || 0;
      }

      // 自动 compact：当上下文占用超过 80% 时触发
      if (result.usage && conversationId) {
        const contextWindow = getContextWindow(model);
        const usageRatio = result.usage.inputTokens / contextWindow;

        if (usageRatio >= 0.8) {
          await this.autoCompact(conversationId, model, messages, sendEvent, signal);
        }
      }

      // 构建 assistant 消息的持久化内容（合并文本和生成的图片 blocks）
      const buildMessageContent = (): MessageContent => {
        if (result.contentBlocks && result.contentBlocks.length > 0) {
          const blocks: ContentBlock[] = [];
          if (result.content) blocks.push({ type: "text", text: result.content });
          blocks.push(...result.contentBlocks);
          return blocks;
        }
        return result.content;
      };

      // 如果有 tool calls，需要执行并继续循环
      if (result.toolCalls && result.toolCalls.length > 0 && allToolDefs.length > 0) {
        // 持久化 assistant 消息（含 tool calls）
        if (conversationId) {
          await this.repo.appendMessage({
            id: uuidv4(),
            conversationId,
            role: "assistant",
            content: buildMessageContent(),
            thinking: result.thinking ? { content: result.thinking } : undefined,
            toolCalls: result.toolCalls,
            createtime: Date.now(),
          });
        }

        // 将 assistant 消息加入上下文（带 toolCalls，供 provider 构建 tool_calls 字段）
        messages.push({ role: "assistant", content: result.content || "", toolCalls: result.toolCalls });

        // 通过 ToolRegistry 执行工具（内置工具直接执行，脚本工具回调 Sandbox）
        const toolResults = await this.toolRegistry.execute(result.toolCalls, scriptToolCallback);

        // 将 tool 结果加入消息，并通知 UI 工具执行完成
        // 收集需要回写附件的 toolCall ID → Attachment[]
        const attachmentUpdates = new Map<string, Attachment[]>();

        for (const tr of toolResults) {
          // LLM 上下文只包含文本结果，不含附件
          messages.push({ role: "tool", content: tr.result, toolCallId: tr.id });
          // 通知 UI 工具执行完成（含附件元数据）
          sendEvent({ type: "tool_call_complete", id: tr.id, result: tr.result, attachments: tr.attachments });

          if (tr.attachments?.length) {
            attachmentUpdates.set(tr.id, tr.attachments);
          }

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

        // 回写附件元数据到 assistant 消息的 toolCalls（内存 + 持久化）
        if (attachmentUpdates.size > 0) {
          // 找到最近的 assistant 消息（刚推入的倒数第 toolResults.length + 1 位）
          const assistantMsg = messages.find(
            (m) => m.role === "assistant" && m.toolCalls?.some((tc) => attachmentUpdates.has(tc.id))
          );
          if (assistantMsg?.toolCalls) {
            for (const tc of assistantMsg.toolCalls) {
              const atts = attachmentUpdates.get(tc.id);
              if (atts) tc.attachments = atts;
            }
            // 更新持久化的 assistant 消息
            if (conversationId) {
              const allMessages = await this.repo.getMessages(conversationId);
              // 找到最后一条有匹配 toolCall 的 assistant 消息
              for (let i = allMessages.length - 1; i >= 0; i--) {
                const msg = allMessages[i];
                if (msg.role === "assistant" && msg.toolCalls?.some((tc) => attachmentUpdates.has(tc.id))) {
                  for (const tc of msg.toolCalls!) {
                    const atts = attachmentUpdates.get(tc.id);
                    if (atts) tc.attachments = atts;
                  }
                  await this.repo.saveMessages(conversationId, allMessages);
                  break;
                }
              }
            }
          }
        }

        // 通知 UI 即将开始新一轮 LLM 调用，创建新的 assistant 消息
        sendEvent({ type: "new_message" });

        // 继续循环
        continue;
      }

      // 没有 tool calls，对话结束
      const durationMs = Date.now() - startTime;
      if (conversationId) {
        await this.repo.appendMessage({
          id: uuidv4(),
          conversationId,
          role: "assistant",
          content: buildMessageContent(),
          thinking: result.thinking ? { content: result.thinking } : undefined,
          usage: totalUsage,
          durationMs,
          createtime: Date.now(),
        });
      }

      // 发送 done 事件
      sendEvent({ type: "done", usage: totalUsage, durationMs });
      return;
    }

    // 超过最大迭代次数
    const maxIterMsg = `Tool calling loop exceeded maximum iterations (${maxIterations})`;
    if (conversationId) {
      await this.repo.appendMessage({
        id: uuidv4(),
        conversationId,
        role: "assistant",
        content: "",
        error: maxIterMsg,
        createtime: Date.now(),
      });
    }
    sendEvent({
      type: "error",
      message: maxIterMsg,
      errorCode: "max_iterations",
    });
  }

  // 解析消息中 image+vision 的 attachmentId → base64 data URL
  // file/audio/image(无vision) 不加载，provider 使用 OPFS 路径引用
  private async resolveAttachments(
    messages: ChatRequest["messages"],
    model: AgentModelConfig
  ): Promise<(id: string) => string | null> {
    const resolved = new Map<string, string>();
    const mimeTypes = new Map<string, string>();
    const ids = new Set<string>();
    const hasVision = supportsVision(model);

    for (const m of messages) {
      if (isContentBlocks(m.content)) {
        for (const block of m.content) {
          // 只收集 image + vision 的 attachmentId
          if (block.type === "image" && hasVision && "attachmentId" in block) {
            ids.add(block.attachmentId);
            if (block.mimeType) {
              mimeTypes.set(block.attachmentId, block.mimeType);
            }
          }
        }
      }
    }

    if (ids.size === 0) return () => null;

    for (const id of ids) {
      try {
        const blob = await this.repo.getAttachment(id);
        if (blob) {
          // Blob → base64 data URL（分块拼接，避免 O(n²) 字符串拼接）
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const CHUNK_SIZE = 8192;
          const chunks: string[] = [];
          for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
            chunks.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length))));
          }
          const b64 = btoa(chunks.join(""));
          const mime = mimeTypes.get(id) || blob.type || "application/octet-stream";
          resolved.set(id, `data:${mime};base64,${b64}`);
        }
      } catch {
        // 加载失败，跳过
      }
    }

    return (id: string) => resolved.get(id) ?? null;
  }

  // 启动子代理执行子任务
  private async runSubAgent(params: {
    model: AgentModelConfig;
    prompt: string;
    sendEvent: (event: ChatStreamEvent) => void;
    signal: AbortSignal;
    excludeTools: string[];
    maxIterations: number;
  }): Promise<string> {
    const systemContent = buildSystemPrompt({});
    const messages: ChatRequest["messages"] = [
      { role: "system", content: systemContent },
      { role: "user", content: params.prompt },
    ];

    let resultContent = "";

    const subSendEvent = (event: ChatStreamEvent) => {
      // 转发事件给父代理
      params.sendEvent(event);
      // 收集最终回复内容（new_message 表示新一轮，只取最后一轮的文本）
      if (event.type === "new_message") {
        resultContent = "";
      } else if (event.type === "content_delta") {
        resultContent += event.delta;
      }
    };

    await this.callLLMWithToolLoop({
      model: params.model,
      messages,
      maxIterations: params.maxIterations,
      sendEvent: subSendEvent,
      signal: params.signal,
      scriptToolCallback: null,
      excludeTools: params.excludeTools,
      cache: false,
    });

    return resultContent || "(sub-agent produced no output)";
  }

  // 统一的流式 conversation chat（UI 和脚本 API 共用）
  private async autoCompact(
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
    const result = await this.callLLM(model, { messages: summaryMessages, cache: false }, noopSendEvent, signal);

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
    await this.repo.saveMessages(conversationId, [summaryMessage]);

    // 通知 UI
    sendEvent({ type: "compact_done", summary, originalCount: -1 });
  }

  private async handleConversationChat(
    params: {
      conversationId: string;
      message: MessageContent;
      tools?: ToolDefinition[];
      maxIterations?: number;
      scriptUuid?: string;
      modelId?: string;
      enableTools?: boolean; // 是否携带 tools，undefined 表示不覆盖
      // 用户消息已在存储中（重新生成场景），跳过保存和 LLM 上下文追加
      skipSaveUserMessage?: boolean;
      // ephemeral 会话专用字段
      ephemeral?: boolean;
      messages?: ChatRequest["messages"];
      system?: string;
      cache?: boolean;
      // compact 模式
      compact?: boolean;
      compactInstruction?: string;
      // 后台运行模式
      background?: boolean;
    },
    sender: IGetSender
  ) {
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("Conversation chat requires connect mode");
    }
    const msgConn = sender.getConnect()!;

    // 后台模式：非 ephemeral、非 compact 时可用
    const isBackground = params.background === true && !params.ephemeral && !params.compact;

    // 检查是否已有后台运行的同一会话
    if (isBackground && this.runningConversations.has(params.conversationId)) {
      msgConn.sendMessage({
        action: "event",
        data: { type: "error", message: "会话正在运行中" } as ChatStreamEvent,
      });
      return;
    }

    const abortController = new AbortController();
    let isDisconnected = false;

    // 后台模式：创建 RunningConversation
    let rc: RunningConversation | undefined;
    if (isBackground) {
      rc = {
        conversationId: params.conversationId,
        abortController,
        listeners: new Set(),
        streamingState: { content: "", thinking: "", toolCalls: [] },
        askResolvers: new Map(),
        tasks: [],
        status: "running",
      };
      this.runningConversations.set(params.conversationId, rc);
    }

    // ask_user resolvers（后台模式挂在 rc 上，普通模式本地）
    const askResolvers = rc ? rc.askResolvers : new Map<string, (answer: string) => void>();

    const sendEvent = (event: ChatStreamEvent) => {
      if (rc) {
        // 后台模式：先更新快照，再广播到所有 listener
        this.updateStreamingState(rc, event);
        this.broadcastEvent(rc, event);
      } else {
        if (!isDisconnected) {
          msgConn.sendMessage({ action: "event", data: event });
        }
      }
    };

    if (rc) {
      // 后台模式：初始 listener
      const listener: ListenerEntry = {
        sendEvent: (event) => {
          if (!isDisconnected) {
            msgConn.sendMessage({ action: "event", data: event });
          }
        },
      };
      rc.listeners.add(listener);

      msgConn.onDisconnect(() => {
        isDisconnected = true;
        // 后台模式：只移除 listener，不 abort
        rc!.listeners.delete(listener);
      });
    } else {
      msgConn.onDisconnect(() => {
        isDisconnected = true;
        abortController.abort();
      });
    }

    // 构建脚本工具回调：通过 MessageConnect 让 Sandbox 执行 handler
    let toolResultResolve: ((results: Array<{ id: string; result: string }>) => void) | null = null;

    msgConn.onMessage((msg: any) => {
      if (msg.action === "toolResults" && toolResultResolve) {
        const resolve = toolResultResolve;
        toolResultResolve = null;
        resolve(msg.data);
      }
      if (msg.action === "askUserResponse" && msg.data) {
        const resolver = askResolvers.get(msg.data.id);
        if (resolver) {
          askResolvers.delete(msg.data.id);
          if (rc) rc.pendingAskUser = undefined;
          resolver(msg.data.answer);
        }
      }
      if (msg.action === "stop") {
        abortController.abort();
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

        // 添加 system prompt（内置提示词 + 用户自定义）
        const ephemeralSystem = buildSystemPrompt({ userSystem: params.system });
        messages.push({ role: "system", content: ephemeralSystem });

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
          cache: params.cache,
        });
        return;
      }

      // compact 模式：压缩对话历史
      if (params.compact) {
        const conv = await this.getConversation(params.conversationId);
        if (!conv) {
          sendEvent({ type: "error", message: "Conversation not found" });
          return;
        }

        const model = await this.getModel(params.modelId || conv.modelId);
        const existingMessages = await this.repo.getMessages(params.conversationId);

        if (existingMessages.filter((m) => m.role !== "system").length === 0) {
          sendEvent({ type: "error", message: "No messages to compact" });
          return;
        }

        // 构建摘要请求
        const summaryMessages: ChatRequest["messages"] = [];
        summaryMessages.push({ role: "system", content: COMPACT_SYSTEM_PROMPT });

        for (const msg of existingMessages) {
          if (msg.role === "system") continue;
          summaryMessages.push({
            role: msg.role,
            content: msg.content,
            toolCallId: msg.toolCallId,
            toolCalls: msg.toolCalls,
          });
        }

        summaryMessages.push({ role: "user", content: buildCompactUserPrompt(params.compactInstruction) });

        // 不带 tools 调用 LLM
        const result = await this.callLLM(
          model,
          { messages: summaryMessages, cache: false },
          sendEvent,
          abortController.signal
        );

        const summary = extractSummary(result.content);
        const originalCount = existingMessages.length;

        // 用摘要消息替换历史
        const summaryMessage = {
          id: uuidv4(),
          conversationId: params.conversationId,
          role: "user" as const,
          content: `[Conversation Summary]\n\n${summary}`,
          createtime: Date.now(),
        };
        await this.repo.saveMessages(params.conversationId, [summaryMessage]);

        sendEvent({ type: "compact_done", summary, originalCount });
        sendEvent({ type: "done", usage: result.usage });
        return;
      }

      // 获取对话和模型
      const conv = await this.getConversation(params.conversationId);
      if (!conv) {
        sendEvent({ type: "error", message: "Conversation not found" });
        return;
      }

      // UI 传入 modelId / enableTools 时覆盖 conversation 的配置
      let needSave = false;
      if (params.modelId && params.modelId !== conv.modelId) {
        conv.modelId = params.modelId;
        needSave = true;
      }
      if (params.enableTools !== undefined && params.enableTools !== conv.enableTools) {
        conv.enableTools = params.enableTools;
        needSave = true;
      }
      if (needSave) {
        conv.updatetime = Date.now();
        await this.repo.saveConversation(conv);
      }

      const model = await this.getModel(conv.modelId);

      // enableTools 默认为 true
      const enableTools = conv.enableTools !== false;

      // 解析 Skills（注入 prompt + 注册 meta-tools），仅在启用 tools 时执行
      let promptSuffix = "";
      const registeredMetaToolNames: string[] = [];
      let metaTools: Array<{ definition: ToolDefinition; executor: ToolExecutor }> = [];
      if (enableTools) {
        const resolved = this.resolveSkills(conv.skills);
        promptSuffix = resolved.promptSuffix;
        metaTools = resolved.metaTools;

        // 临时注册 skill meta-tools（对话结束后清理）
        for (const mt of metaTools) {
          this.toolRegistry.registerBuiltin(mt.definition, mt.executor);
          registeredMetaToolNames.push(mt.definition.name);
        }

        // 注册每次请求的临时工具
        // Task tools（从持久化加载，变更时保存并推送事件到 UI）
        const initialTasks = await this.repo.getTasks(params.conversationId);
        const { tools: taskToolDefs } = createTaskTools({
          initialTasks,
          onSave: (tasks) => this.repo.saveTasks(params.conversationId, tasks),
          sendEvent,
        });
        for (const t of taskToolDefs) {
          this.toolRegistry.registerBuiltin(t.definition, t.executor);
          registeredMetaToolNames.push(t.definition.name);
        }

        // Ask user
        const askTool = createAskUserTool(sendEvent, askResolvers);
        this.toolRegistry.registerBuiltin(askTool.definition, askTool.executor);
        registeredMetaToolNames.push(askTool.definition.name);

        // Sub-agent
        const subAgentTool = createSubAgentTool({
          runSubAgent: (prompt: string, desc: string) => {
            const agentId = uuidv4();
            // 组合父信号和 10 分钟超时信号
            const subSignal = AbortSignal.any([abortController.signal, AbortSignal.timeout(600_000)]);
            return this.runSubAgent({
              model,
              prompt,
              signal: subSignal,
              sendEvent: (evt) => sendEvent({ type: "sub_agent_event", agentId, description: desc, event: evt }),
              excludeTools: ["ask_user", "agent"],
              maxIterations: 30,
            });
          },
        });
        this.toolRegistry.registerBuiltin(subAgentTool.definition, subAgentTool.executor);
        registeredMetaToolNames.push(subAgentTool.definition.name);

        // Execute script
        const executeScriptTool = createExecuteScriptTool({
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
        });
        this.toolRegistry.registerBuiltin(executeScriptTool.definition, executeScriptTool.executor);
        registeredMetaToolNames.push(executeScriptTool.definition.name);
      }

      // 加载历史消息
      const existingMessages = await this.repo.getMessages(params.conversationId);

      // 扫描历史消息中的 load_skill 调用，预加载之前已加载的 skill 的工具
      if (enableTools && metaTools.length > 0) {
        const loadSkillMeta = metaTools.find((mt) => mt.definition.name === "load_skill");
        if (loadSkillMeta) {
          const loadedSkillNames = new Set<string>();
          for (const msg of existingMessages) {
            if (msg.role === "assistant" && msg.toolCalls) {
              for (const tc of msg.toolCalls) {
                if (tc.name === "load_skill") {
                  try {
                    const args = JSON.parse(tc.arguments || "{}");
                    if (args.skill_name) {
                      loadedSkillNames.add(args.skill_name);
                    }
                  } catch {
                    // 解析失败，跳过
                  }
                }
              }
            }
          }
          // 预执行 load_skill 以注册动态工具（结果不需要，只需要副作用）
          for (const skillName of loadedSkillNames) {
            try {
              await loadSkillMeta.executor.execute({ skill_name: skillName });
            } catch {
              // 加载失败，跳过
            }
          }
        }
      }

      // 构建消息列表
      const messages: ChatRequest["messages"] = [];

      // 添加 system 消息（内置提示词 + 用户自定义 + skill prompt）
      const systemContent = buildSystemPrompt({
        userSystem: conv.system,
        skillSuffix: enableTools ? promptSuffix : undefined,
      });
      messages.push({ role: "system", content: systemContent });

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

      if (!params.skipSaveUserMessage) {
        // 添加新用户消息到 LLM 上下文并持久化
        messages.push({ role: "user", content: params.message });
        await this.repo.appendMessage({
          id: uuidv4(),
          conversationId: params.conversationId,
          role: "user",
          content: params.message,
          createtime: Date.now(),
        });
      }

      // 更新对话标题（如果是第一条消息）
      if (existingMessages.length === 0 && conv.title === "New Chat") {
        const titleText = getTextContent(params.message);
        conv.title = titleText.slice(0, 30) + (titleText.length > 30 ? "..." : "");
        conv.updatetime = Date.now();
        await this.repo.saveConversation(conv);
      }

      try {
        // 使用统一的 tool calling 循环
        await this.callLLMWithToolLoop({
          model,
          messages,
          tools: enableTools ? params.tools : undefined,
          maxIterations: params.maxIterations || 50,
          sendEvent,
          signal: abortController.signal,
          scriptToolCallback: enableTools && params.tools && params.tools.length > 0 ? scriptToolCallback : null,
          conversationId: params.conversationId,
          skipBuiltinTools: !enableTools,
        });
        // 后台模式：正常完成后延迟清理
        this.cleanupRunningConversation(params.conversationId);
      } finally {
        // 清理临时注册的 meta-tools
        for (const name of registeredMetaToolNames) {
          this.toolRegistry.unregisterBuiltin(name);
        }
      }
    } catch (e: any) {
      // 后台模式：abort 也需要清理注册表
      if (abortController.signal.aborted) {
        this.cleanupRunningConversation(params.conversationId);
        return;
      }
      const errorMsg = e.message || "Unknown error";
      // 持久化错误消息到 OPFS，确保刷新后仍可见
      if (params.conversationId && !params.ephemeral) {
        try {
          await this.repo.appendMessage({
            id: uuidv4(),
            conversationId: params.conversationId,
            role: "assistant",
            content: "",
            error: errorMsg,
            createtime: Date.now(),
          });
        } catch {
          // 持久化失败不阻塞错误事件发送
        }
      }
      sendEvent({ type: "error", message: errorMsg, errorCode: classifyErrorCode(e) });
      this.cleanupRunningConversation(params.conversationId);
    }
  }

  // 延迟清理后台运行会话注册表（给迟到的重连者 30s 窗口）
  private cleanupRunningConversation(conversationId: string) {
    const rc = this.runningConversations.get(conversationId);
    if (!rc) return;
    setTimeout(() => {
      this.runningConversations.delete(conversationId);
    }, 30_000);
  }

  // 对内容做摘要/提取（供 tab 工具使用）
  // 优先使用摘要模型，fallback 到默认模型
  private async summarizeContent(content: string, prompt: string): Promise<string> {
    let model: AgentModelConfig | undefined;
    const summaryId = await this.modelRepo.getSummaryModelId();
    if (summaryId) {
      model = await this.modelRepo.getModel(summaryId);
    }
    if (!model) {
      const defaultId = await this.modelRepo.getDefaultModelId();
      if (defaultId) {
        model = await this.modelRepo.getModel(defaultId);
      }
    }
    if (!model) {
      throw new Error("No model configured for summarization");
    }

    const messages: ChatRequest["messages"] = [
      {
        role: "system" as const,
        content: "根据用户要求，从以下网页内容中提取/摘要信息。只返回相关内容，不要解释。",
      },
      {
        role: "user" as const,
        content: `${prompt}\n\n---\n\n${content}`,
      },
    ];

    const noopSendEvent = () => {};
    const controller = new AbortController();
    try {
      const result = await this.callLLM(model, { messages, cache: false }, noopSendEvent, controller.signal);
      return result.content;
    } catch (e: any) {
      throw new Error(`Summarization failed: ${e.message}`);
    }
  }

  // 调用 LLM 并收集完整响应（内部处理流式）
  private async callLLM(
    model: AgentModelConfig,
    params: { messages: ChatRequest["messages"]; tools?: ToolDefinition[]; cache?: boolean },
    sendEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<{
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
  }> {
    const chatRequest: ChatRequest = {
      conversationId: "",
      modelId: model.id,
      messages: params.messages,
      tools: params.tools,
      cache: params.cache,
    };

    // 预解析消息中 ContentBlock 引用的 attachmentId → base64
    const attachmentResolver = await this.resolveAttachments(params.messages, model);

    const { url, init } =
      model.provider === "anthropic"
        ? buildAnthropicRequest(model, chatRequest, attachmentResolver)
        : buildOpenAIRequest(model, chatRequest, attachmentResolver);

    // 带重试的 LLM 调用，最多重试 5 次，间隔递增：10s, 10s, 20s, 20s, 30s
    const RETRY_DELAYS = [10_000, 10_000, 20_000, 20_000, 30_000];
    const MAX_RETRIES = RETRY_DELAYS.length;
    let response!: Response;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch(url, { ...init, signal });

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
        // 请求成功，跳出重试循环
        break;
      } catch (e: any) {
        // 用户取消时直接抛出，不重试
        if (signal.aborted) throw e;
        // 已用完所有重试次数
        if (attempt >= MAX_RETRIES) throw e;
        // 向 UI 发送重试通知（含延迟时间，用于倒计时显示）
        const delayMs = RETRY_DELAYS[attempt];
        sendEvent({
          type: "retry",
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          error: e.message || "Unknown error",
          delayMs,
        });
        // 等待后重试，等待期间可被 abort 取消
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          const onAbort = () => {
            clearTimeout(timer);
            reject(new Error("Aborted during retry wait"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
        });
      }
    }

    const reader = response.body!.getReader();
    const parseStream = model.provider === "anthropic" ? parseAnthropicStream : parseOpenAIStream;

    // 收集响应
    let content = "";
    let thinking = "";
    const toolCalls: ToolCall[] = [];
    let currentToolCall: ToolCall | null = null;
    let usage:
      | { inputTokens: number; outputTokens: number; cacheCreationInputTokens?: number; cacheReadInputTokens?: number }
      | undefined;
    // 收集带 data 的图片 block（模型生成的图片），stream 结束后统一保存到 OPFS
    const pendingImageSaves: Array<{ block: ContentBlock & { type: "image" }; data: string }> = [];

    return new Promise((resolve, reject) => {
      const onEvent = (event: ChatStreamEvent) => {
        // 只转发流式内容事件，done 和 error 由 callLLMWithToolLoop 统一管理
        // 避免在 tool calling 循环中提前发送 done 导致客户端过早 resolve
        // 带 data 的 content_block_complete 暂不转发，等 OPFS 保存后再发
        if (event.type !== "done" && event.type !== "error") {
          if (event.type === "content_block_complete" && event.data) {
            // 暂存，稍后保存到 OPFS 后再转发
            pendingImageSaves.push({ block: event.block as ContentBlock & { type: "image" }, data: event.data });
          } else {
            sendEvent(event);
          }
        }

        switch (event.type) {
          case "content_delta":
            content += event.delta;
            break;
          case "thinking_delta":
            thinking += event.delta;
            break;
          case "tool_call_start":
            // 如果已有一个正在收集的 tool call，先保存它（多个 tool_use 并行返回时）
            if (currentToolCall) {
              toolCalls.push(currentToolCall);
            }
            currentToolCall = { ...event.toolCall, arguments: event.toolCall.arguments || "" };
            break;
          case "tool_call_delta":
            if (currentToolCall) {
              currentToolCall.arguments += event.delta;
            }
            break;
          case "done": {
            // 保存当前的 tool call
            if (currentToolCall) {
              toolCalls.push(currentToolCall);
              currentToolCall = null;
            }
            if (event.usage) {
              usage = event.usage;
            }

            // 保存模型生成的图片到 OPFS，然后转发事件
            const finalize = async () => {
              const savedBlocks: ContentBlock[] = [];
              for (const pending of pendingImageSaves) {
                try {
                  await this.repo.saveAttachment(pending.block.attachmentId, pending.data);
                  savedBlocks.push(pending.block);
                  // 转发不含 data 的 content_block_complete 事件给 UI
                  sendEvent({ type: "content_block_complete", block: pending.block });
                } catch {
                  // 保存失败忽略
                }
              }

              // 提取文本中的 markdown 内联 base64 图片（某些 API 以 ![alt](data:image/...;base64,...) 形式返回图片）
              const imgRegex = /!\[([^\]]*)\]\((data:image\/([^;]+);base64,[A-Za-z0-9+/=\s]+)\)/g;
              let match;
              let cleanedContent = content;
              while ((match = imgRegex.exec(content)) !== null) {
                const [fullMatch, alt, dataUrl, subtype] = match;
                const mimeType = `image/${subtype}`;
                const ext = subtype || "png";
                const blockId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
                try {
                  await this.repo.saveAttachment(blockId, dataUrl);
                  const block: ContentBlock = {
                    type: "image",
                    attachmentId: blockId,
                    mimeType,
                    name: alt || "generated-image",
                  };
                  savedBlocks.push(block);
                  sendEvent({ type: "content_block_complete", block });
                  cleanedContent = cleanedContent.replace(fullMatch, "");
                } catch {
                  // 保存失败保留原始 markdown
                }
              }
              // 清理提取图片后的多余空行
              if (cleanedContent !== content) {
                content = cleanedContent.replace(/\n{3,}/g, "\n\n").trim();
              }

              return savedBlocks.length > 0 ? savedBlocks : undefined;
            };

            finalize()
              .then((contentBlocks) => {
                resolve({
                  content,
                  thinking: thinking || undefined,
                  toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                  usage,
                  contentBlocks,
                });
              })
              .catch(reject);
            break;
          }
          case "error":
            reject(new Error(event.message));
            break;
        }
      };

      parseStream(reader, onEvent, signal).catch(reject);
    });
  }
}
