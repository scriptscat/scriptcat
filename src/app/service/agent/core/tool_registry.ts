import type { Attachment, SubAgentDetails, ToolCall, ToolDefinition, ToolResultWithAttachments } from "./types";
import type { AgentChatRepo } from "@App/app/repo/agent_chat";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { getExtFromMime } from "./content_utils";
import { raceWithAbort, throwIfAborted } from "./abort_utils";

// 工具执行器接口
export interface ToolExecutor {
  execute(args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
}

// 工具来源分类
// - builtin: 启动期永久注册的内置工具（web_fetch / web_search / opfs_* / tab_*）
// - mcp: MCP server 提供的工具
// - skill: skill meta-tools (load_skill, execute_skill_script, read_reference)
// - session: 会话级动态注册的工具（task tools, ask_user, sub_agent, execute_script）
// - script: 用户脚本通过 conv.chat 传入的自定义工具（不存 Map，走 scriptCallback）
export type ToolSource = "builtin" | "mcp" | "skill" | "session" | "script";

// 工具条目（带来源追踪）
export interface ToolEntry {
  definition: ToolDefinition;
  executor: ToolExecutor;
  source: ToolSource;
}

// 脚本工具回调类型：将 tool calls 发送到 Sandbox 执行
export type ScriptToolCallback = (
  toolCalls: ToolCall[],
  signal?: AbortSignal
) => Promise<Array<{ id: string; result: string; error?: boolean }>>;

// 工具执行结果（可能含附件和子代理详情）
export type ToolExecuteResult = {
  id: string;
  result: string;
  error?: boolean;
  attachments?: Attachment[];
  subAgentDetails?: SubAgentDetails;
};

// 可执行工具的最小接口，供 ToolLoopOrchestrator / SubAgentService 按接口接收
// 同时适用于 ToolRegistry（全局）和 SessionToolRegistry（会话级）
export interface ToolExecutorLike {
  getDefinitions(extraTools?: ToolDefinition[]): ToolDefinition[];
  execute(
    toolCalls: ToolCall[],
    scriptCallback?: ScriptToolCallback | null,
    excludeTools?: Set<string>,
    signal?: AbortSignal
  ): Promise<ToolExecuteResult[]>;
}

// 从异常中提取错误消息（兼容 Error 对象和直接 throw 的字符串）
function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.toString();
  if (typeof e === "string") return e;
  return String(e) || "Tool execution failed";
}

function normalizeToolResult(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return "null";
  }
}

// 判断返回值是否是带附件的结构化结果
function isToolResultWithAttachments(value: unknown): value is ToolResultWithAttachments {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.content === "string" && Array.isArray(obj.attachments);
}

// 判断返回值是否包含子代理详情
function isToolResultWithSubAgent(value: unknown): value is { content: string; subAgentDetails: SubAgentDetails } {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.content === "string" && typeof obj.subAgentDetails === "object" && obj.subAgentDetails !== null;
}

// 工具注册表，管理内置工具和脚本工具的统一执行
// 作为"全局"注册表，承载启动期永久工具（builtin）和 MCP 动态工具
// 会话级临时工具请使用 SessionToolRegistry（见 ./session_tool_registry.ts）
export class ToolRegistry implements ToolExecutorLike {
  private tools = new Map<string, ToolEntry>();
  private chatRepo?: AgentChatRepo;

  // 暴露底层 Map 的只读视图，供 SessionToolRegistry 构建合并视图
  getTools(): ReadonlyMap<string, ToolEntry> {
    return this.tools;
  }

  // 暴露 chatRepo，供 SessionToolRegistry 共享附件保存路径
  // （session 工具返回附件时，调用相同的 saveAttachments 路径）
  getChatRepo(): AgentChatRepo | undefined {
    return this.chatRepo;
  }

  // 注入 AgentChatRepo 用于保存附件
  setChatRepo(repo: AgentChatRepo): void {
    this.chatRepo = repo;
  }

  // 注册工具（带来源追踪）
  register(source: ToolSource, definition: ToolDefinition, executor: ToolExecutor): void {
    this.tools.set(definition.name, { definition, executor, source });
  }

  // 注册内置工具（兼容旧 API，等价于 register("builtin", ...)）
  registerBuiltin(definition: ToolDefinition, executor: ToolExecutor): void {
    this.register("builtin", definition, executor);
  }

  // 按名称注销工具
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  // 注销内置工具（兼容旧 API，等价于 unregister(name)）
  unregisterBuiltin(name: string): boolean {
    return this.unregister(name);
  }

  // 批量注销某个来源的所有工具（用于 MCP server 断开时清理）
  unregisterBySource(source: ToolSource): string[] {
    const removed: string[] = [];
    for (const [name, entry] of this.tools.entries()) {
      if (entry.source === source) {
        this.tools.delete(name);
        removed.push(name);
      }
    }
    return removed;
  }

  // 获取某个工具的来源信息（调试用）
  getSource(name: string): ToolSource | undefined {
    return this.tools.get(name)?.source;
  }

  // 列出某来源的所有工具名
  listBySource(source: ToolSource): string[] {
    const names: string[] = [];
    for (const [name, entry] of this.tools.entries()) {
      if (entry.source === source) names.push(name);
    }
    return names;
  }

  // 在临时 scoped 工具范围内执行 fn，保证 finally 清理（即使 fn 抛出）
  // 注意：仍是共享 Map，并发调用同名工具时会互相覆盖；真正的会话隔离需重构为每会话独立实例
  async withScopedTools<T>(
    source: ToolSource,
    scopedTools: Array<{ definition: ToolDefinition; executor: ToolExecutor }>,
    fn: () => Promise<T>
  ): Promise<T> {
    for (const t of scopedTools) {
      this.register(source, t.definition, t.executor);
    }
    try {
      return await fn();
    } finally {
      for (const t of scopedTools) {
        this.unregister(t.definition.name);
      }
    }
  }

  // 获取所有工具定义（内置 + 额外的脚本工具），发送给 LLM
  getDefinitions(extraTools?: ToolDefinition[]): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];
    for (const { definition } of this.tools.values()) {
      definitions.push(definition);
    }
    if (extraTools) {
      definitions.push(...extraTools);
    }
    return definitions;
  }

  // 执行工具调用：先查注册工具，未找到则交给脚本回调
  // 基于自身 Map 执行，等价于 executeTools(this.tools, ...)
  async execute(
    toolCalls: ToolCall[],
    scriptCallback?: ScriptToolCallback | null,
    excludeTools?: Set<string>,
    signal?: AbortSignal
  ): Promise<ToolExecuteResult[]> {
    return this.executeTools(this.tools, toolCalls, scriptCallback, excludeTools, signal);
  }

  // 执行工具调用（接收外部 tools Map），供 SessionToolRegistry 复用附件保存等共享逻辑
  // excludeTools: 禁止执行的工具名集合（子代理能力隔离），命中者直接返回 error
  async executeTools(
    tools: ReadonlyMap<string, ToolEntry>,
    toolCalls: ToolCall[],
    scriptCallback?: ScriptToolCallback | null,
    excludeTools?: Set<string>,
    signal?: AbortSignal
  ): Promise<ToolExecuteResult[]> {
    const results: ToolExecuteResult[] = [];
    const builtinCalls: ToolCall[] = [];
    const scriptCalls: ToolCall[] = [];

    for (const tc of toolCalls) {
      // 强校验 excludeTools：被排除的工具直接返回错误，防止 LLM 盲调绕过
      if (excludeTools && excludeTools.has(tc.name)) {
        results.push({
          id: tc.id,
          result: JSON.stringify({ error: `Tool "${tc.name}" is not available in this context` }),
          error: true,
        });
        continue;
      }
      if (tools.has(tc.name)) {
        builtinCalls.push(tc);
      } else {
        scriptCalls.push(tc);
      }
    }

    // 并行执行注册工具
    const builtinResults = await Promise.all(
      builtinCalls.map(async (tc): Promise<ToolExecuteResult> => {
        const tool = tools.get(tc.name)!;
        try {
          throwIfAborted(signal);
          let args: Record<string, unknown> = {};
          if (tc.arguments) {
            args = JSON.parse(tc.arguments);
          }
          const rawResult = await raceWithAbort(tool.executor.execute(args, signal), signal);

          // 检查是否带附件或子代理详情
          if (isToolResultWithAttachments(rawResult)) {
            const attachments = await this.saveAttachments(rawResult.attachments, signal);
            return { id: tc.id, result: rawResult.content, attachments };
          } else if (isToolResultWithSubAgent(rawResult)) {
            return { id: tc.id, result: rawResult.content, subAgentDetails: rawResult.subAgentDetails };
          } else {
            return { id: tc.id, result: normalizeToolResult(rawResult) };
          }
        } catch (e: any) {
          console.error(`[ToolRegistry] tool "${tc.name}" execution failed:`, e);
          return {
            id: tc.id,
            result: JSON.stringify({ error: extractErrorMessage(e) }),
            error: true,
            subAgentDetails: e.subAgentDetails,
          };
        }
      })
    );
    results.push(...builtinResults);

    if (signal?.aborted) {
      return results;
    }

    // 执行脚本工具
    if (scriptCalls.length > 0) {
      if (scriptCallback) {
        const scriptResults = await raceWithAbort(scriptCallback(scriptCalls, signal), signal);
        // 脚本工具也可能返回带附件的结构化结果
        for (const sr of scriptResults) {
          try {
            const parsed = JSON.parse(sr.result);
            if (isToolResultWithAttachments(parsed)) {
              const attachments = await this.saveAttachments(parsed.attachments, signal);
              results.push({ id: sr.id, result: parsed.content, attachments, error: sr.error });
              continue;
            }
          } catch (e: any) {
            // signal 已 abort 时是附件写入被中止（见 saveAttachments 的 throwIfAborted），
            // 不能落回"按原始字符串处理"分支——那会让脚本工具的原始成功结果继续被当作
            // 已完成上报，掩盖掉附件其实没写完的事实（见 finding 4）
            if (signal?.aborted) {
              results.push({
                id: sr.id,
                result: JSON.stringify({ error: extractErrorMessage(e) }),
                error: true,
              });
              continue;
            }
            // 不是 JSON 或不是结构化结果，按原始字符串处理
          }
          results.push({ id: sr.id, result: sr.result, error: sr.error });
        }
      } else {
        // 没有脚本回调，返回错误并列出可用工具名，引导 LLM 自我纠正
        const availableNames = Array.from(tools.keys());
        for (const tc of scriptCalls) {
          const hint = availableNames.includes("execute_skill_script")
            ? ` If "${tc.name}" is a skill script, use the "execute_skill_script" tool instead.`
            : "";
          results.push({
            id: tc.id,
            result: JSON.stringify({
              error: `Tool "${tc.name}" not found. Available tools: [${availableNames.join(", ")}].${hint}`,
            }),
            error: true,
          });
        }
      }
    }

    return results;
  }

  // 保存附件数据到 OPFS，返回 Attachment 元数据。
  // 传入 signal 时在每个附件写入前检查，abort 时中止剩余写入并抛错——调用方的 catch 块会把这
  // 转成该 toolCall 的 error 结果，避免 Stop 之后仍继续写多个文件（见 finding 4）。
  private async saveAttachments(
    attachmentDataList: ToolResultWithAttachments["attachments"],
    signal?: AbortSignal
  ): Promise<Attachment[]> {
    if (!this.chatRepo || attachmentDataList.length === 0) return [];

    const attachments: Attachment[] = [];
    // 本批真正由这里写入的附件 id（不含无 data 的已保存引用）：中途 abort/失败时必须整批回收，
    // 否则该 toolCall 以 error 结果收场后，这些文件不再被任何消息引用（见 finding 4）
    const savedIds: string[] = [];
    try {
      for (const ad of attachmentDataList) {
        throwIfAborted(signal);
        if (!ad.data) {
          // 无 data 的附件是已保存的引用（如 skill script 返回的 imageBlock），直接透传元数据
          if ("attachmentId" in ad && (ad as any).attachmentId) {
            attachments.push({
              id: (ad as any).attachmentId,
              type: ad.type,
              name: ad.name,
              mimeType: ad.mimeType,
              size: (ad as any).size,
            });
          }
          continue;
        }
        const ext = getExtFromMime(ad.mimeType);
        const id = `${uuidv4()}.${ext}`;
        const size = await this.chatRepo.saveAttachment(id, ad.data);
        savedIds.push(id);
        // 写入期间可能已被 Stop：不能把这次结果当作成功返回，进入 catch 统一回收
        throwIfAborted(signal);
        attachments.push({
          id,
          type: ad.type,
          name: ad.name,
          mimeType: ad.mimeType,
          size,
        });
      }
    } catch (error) {
      const repo = this.chatRepo;
      await Promise.all(savedIds.map((id) => repo.deleteAttachment(id).catch(() => {})));
      throw error;
    }
    return attachments;
  }
}
