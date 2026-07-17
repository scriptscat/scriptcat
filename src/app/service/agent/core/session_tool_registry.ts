import type { ToolCall, ToolDefinition } from "./types";
import type {
  ScriptToolCallback,
  ToolEntry,
  ToolExecuteResult,
  ToolExecutor,
  ToolExecutorLike,
  ToolRegistry,
  ToolSource,
} from "./tool_registry";

/**
 * 会话级工具注册表：为每个会话（chat 请求、定时任务、子代理）提供独立的工具隔离。
 *
 * 架构动机：
 * 原来的 ToolRegistry 是全局共享 Map，会话间 registerBuiltin 同名工具会互相覆盖闭包，
 * 导致并发会话的 task/ask_user/sub_agent 绑定到错误的 conversationId/sendEvent。
 *
 * 本类持有 parent: ToolRegistry 只读引用 + 自己的 sessionTools Map。
 * - register()：只写入 sessionTools（不污染 parent）
 * - getDefinitions()：合并 session + parent（session 同名工具遮蔽 parent）
 * - execute()：构建合并 Map 后，复用 parent.executeTools() 保持附件保存等共享逻辑
 *
 * 会话结束时直接让实例被 GC 回收即可，无需 unregister 循环。
 */
export class SessionToolRegistry implements ToolExecutorLike {
  private sessionTools = new Map<string, ToolEntry>();

  constructor(private readonly parent: ToolRegistry) {}

  /** 注册会话临时工具（绑定到本会话的闭包） */
  register(source: ToolSource, definition: ToolDefinition, executor: ToolExecutor): void {
    this.sessionTools.set(definition.name, { definition, executor, source });
  }

  /** 按名称注销会话工具（通常不需要：实例 GC 即可；但动态 skill 卸载等场景仍可用） */
  unregister(name: string): boolean {
    return this.sessionTools.delete(name);
  }

  /** 列出本会话注册的所有工具名 */
  listSessionTools(): string[] {
    return Array.from(this.sessionTools.keys());
  }

  /**
   * 获取合并后的工具定义：session + parent + extraTools
   * session 工具同名时覆盖 parent，extraTools 同名时不覆盖前两者
   */
  getDefinitions(extraTools?: ToolDefinition[]): ToolDefinition[] {
    const result: ToolDefinition[] = [];
    const seen = new Set<string>();

    // session tools 优先（遮蔽 parent 同名工具）
    for (const entry of this.sessionTools.values()) {
      result.push(entry.definition);
      seen.add(entry.definition.name);
    }

    // parent tools（不覆盖 session）
    for (const def of this.parent.getDefinitions()) {
      if (!seen.has(def.name)) {
        result.push(def);
        seen.add(def.name);
      }
    }

    // 脚本传入的 extraTools（不覆盖 session/parent）
    if (extraTools) {
      for (const def of extraTools) {
        if (!seen.has(def.name)) {
          result.push(def);
          seen.add(def.name);
        }
      }
    }

    return result;
  }

  /**
   * 执行工具调用：session 工具 → parent 工具 → scriptCallback
   * 内部复用 parent.executeTools() 保持附件保存/错误处理等逻辑一致
   */
  async execute(
    toolCalls: ToolCall[],
    scriptCallback?: ScriptToolCallback | null,
    excludeTools?: Set<string>
  ): Promise<ToolExecuteResult[]> {
    // 构建合并 Map：parent 在下、session 在上（session 覆盖 parent 同名工具）
    const merged = new Map<string, ToolEntry>();
    for (const [name, entry] of this.parent.getTools()) {
      merged.set(name, entry);
    }
    for (const [name, entry] of this.sessionTools) {
      merged.set(name, entry);
    }
    return this.parent.executeTools(merged, toolCalls, scriptCallback, excludeTools);
  }
}
