import type { ToolCall, ToolDefinition } from "./types";

// 工具执行器接口
export interface ToolExecutor {
  execute(args: Record<string, unknown>): Promise<unknown>;
}

// 脚本工具回调类型：将 tool calls 发送到 Sandbox 执行
export type ScriptToolCallback = (toolCalls: ToolCall[]) => Promise<Array<{ id: string; result: string }>>;

// 工具注册表，管理内置工具和脚本工具的统一执行
export class ToolRegistry {
  private builtinTools = new Map<string, { definition: ToolDefinition; executor: ToolExecutor }>();

  // 注册内置工具（由 SW 直接执行）
  registerBuiltin(definition: ToolDefinition, executor: ToolExecutor): void {
    this.builtinTools.set(definition.name, { definition, executor });
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
  async execute(
    toolCalls: ToolCall[],
    scriptCallback?: ScriptToolCallback | null
  ): Promise<Array<{ id: string; result: string }>> {
    const builtinCalls: ToolCall[] = [];
    const scriptCalls: ToolCall[] = [];

    for (const tc of toolCalls) {
      if (this.builtinTools.has(tc.name)) {
        builtinCalls.push(tc);
      } else {
        scriptCalls.push(tc);
      }
    }

    const results: Array<{ id: string; result: string }> = [];

    // 执行内置工具
    for (const tc of builtinCalls) {
      const tool = this.builtinTools.get(tc.name)!;
      try {
        let args: Record<string, unknown> = {};
        if (tc.arguments) {
          args = JSON.parse(tc.arguments);
        }
        const result = await tool.executor.execute(args);
        results.push({ id: tc.id, result: typeof result === "string" ? result : JSON.stringify(result) });
      } catch (e: any) {
        results.push({ id: tc.id, result: JSON.stringify({ error: e.message || "Tool execution failed" }) });
      }
    }

    // 执行脚本工具
    if (scriptCalls.length > 0) {
      if (scriptCallback) {
        const scriptResults = await scriptCallback(scriptCalls);
        results.push(...scriptResults);
      } else {
        // 没有脚本回调，返回错误
        for (const tc of scriptCalls) {
          results.push({ id: tc.id, result: JSON.stringify({ error: `Tool "${tc.name}" not found` }) });
        }
      }
    }

    return results;
  }
}
