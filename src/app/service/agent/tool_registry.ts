import type { Attachment, SubAgentDetails, ToolCall, ToolDefinition, ToolResultWithAttachments } from "./types";
import type { AgentChatRepo } from "@App/app/repo/agent_chat";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { getExtFromMime } from "./content_utils";

// 工具执行器接口
export interface ToolExecutor {
  execute(args: Record<string, unknown>): Promise<unknown>;
}

// 脚本工具回调类型：将 tool calls 发送到 Sandbox 执行
export type ScriptToolCallback = (toolCalls: ToolCall[]) => Promise<Array<{ id: string; result: string }>>;

// 工具执行结果（可能含附件和子代理详情）
export type ToolExecuteResult = {
  id: string;
  result: string;
  attachments?: Attachment[];
  subAgentDetails?: SubAgentDetails;
};

// 从异常中提取错误消息（兼容 Error 对象和直接 throw 的字符串）
function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.toString();
  if (typeof e === "string") return e;
  return String(e) || "Tool execution failed";
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
export class ToolRegistry {
  private builtinTools = new Map<string, { definition: ToolDefinition; executor: ToolExecutor }>();
  private chatRepo?: AgentChatRepo;

  // 注入 AgentChatRepo 用于保存附件
  setChatRepo(repo: AgentChatRepo): void {
    this.chatRepo = repo;
  }

  // 注册内置工具（由 SW 直接执行）
  registerBuiltin(definition: ToolDefinition, executor: ToolExecutor): void {
    this.builtinTools.set(definition.name, { definition, executor });
  }

  // 注销内置工具
  unregisterBuiltin(name: string): boolean {
    return this.builtinTools.delete(name);
  }

  // 获取所有工具定义（内置 + 额外的脚本工具），发送给 LLM
  getDefinitions(extraTools?: ToolDefinition[]): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];
    for (const { definition } of this.builtinTools.values()) {
      definitions.push(definition);
    }
    if (extraTools) {
      definitions.push(...extraTools);
    }
    return definitions;
  }

  // 执行工具调用：先查内置工具，未找到则交给脚本回调
  async execute(toolCalls: ToolCall[], scriptCallback?: ScriptToolCallback | null): Promise<ToolExecuteResult[]> {
    const builtinCalls: ToolCall[] = [];
    const scriptCalls: ToolCall[] = [];

    for (const tc of toolCalls) {
      if (this.builtinTools.has(tc.name)) {
        builtinCalls.push(tc);
      } else {
        scriptCalls.push(tc);
      }
    }

    const results: ToolExecuteResult[] = [];

    // 并行执行内置工具
    const builtinResults = await Promise.all(
      builtinCalls.map(async (tc): Promise<ToolExecuteResult> => {
        const tool = this.builtinTools.get(tc.name)!;
        try {
          let args: Record<string, unknown> = {};
          if (tc.arguments) {
            args = JSON.parse(tc.arguments);
          }
          const rawResult = await tool.executor.execute(args);

          // 检查是否带附件或子代理详情
          if (isToolResultWithAttachments(rawResult)) {
            const attachments = await this.saveAttachments(rawResult.attachments);
            return { id: tc.id, result: rawResult.content, attachments };
          } else if (isToolResultWithSubAgent(rawResult)) {
            return { id: tc.id, result: rawResult.content, subAgentDetails: rawResult.subAgentDetails };
          } else {
            return { id: tc.id, result: typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult) };
          }
        } catch (e: any) {
          console.error(`[ToolRegistry] builtin tool "${tc.name}" execution failed:`, e);
          return { id: tc.id, result: JSON.stringify({ error: extractErrorMessage(e) }) };
        }
      })
    );
    results.push(...builtinResults);

    // 执行脚本工具
    if (scriptCalls.length > 0) {
      if (scriptCallback) {
        const scriptResults = await scriptCallback(scriptCalls);
        // 脚本工具也可能返回带附件的结构化结果
        for (const sr of scriptResults) {
          try {
            const parsed = JSON.parse(sr.result);
            if (isToolResultWithAttachments(parsed)) {
              const attachments = await this.saveAttachments(parsed.attachments);
              results.push({ id: sr.id, result: parsed.content, attachments });
              continue;
            }
          } catch {
            // 不是 JSON 或不是结构化结果，按原始字符串处理
          }
          results.push({ id: sr.id, result: sr.result });
        }
      } else {
        // 没有脚本回调，返回错误并列出可用工具名，引导 LLM 自我纠正
        const availableNames = Array.from(this.builtinTools.keys());
        for (const tc of scriptCalls) {
          const hint = availableNames.includes("execute_skill_script")
            ? ` If "${tc.name}" is a skill script, use the "execute_skill_script" tool instead.`
            : "";
          results.push({
            id: tc.id,
            result: JSON.stringify({
              error: `Tool "${tc.name}" not found. Available tools: [${availableNames.join(", ")}].${hint}`,
            }),
          });
        }
      }
    }

    return results;
  }

  // 保存附件数据到 OPFS，返回 Attachment 元数据
  private async saveAttachments(attachmentDataList: ToolResultWithAttachments["attachments"]): Promise<Attachment[]> {
    if (!this.chatRepo || attachmentDataList.length === 0) return [];

    const attachments: Attachment[] = [];
    for (const ad of attachmentDataList) {
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
      attachments.push({
        id,
        type: ad.type,
        name: ad.name,
        mimeType: ad.mimeType,
        size,
      });
    }
    return attachments;
  }
}
