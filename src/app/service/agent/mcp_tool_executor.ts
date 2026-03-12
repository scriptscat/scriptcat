import type { MCPClient } from "./mcp_client";
import type { ToolExecutor } from "./tool_registry";

// MCP 工具执行器，将 ToolExecutor 接口桥接到 MCPClient.callTool
export class MCPToolExecutor implements ToolExecutor {
  constructor(
    private client: MCPClient,
    private toolName: string
  ) {}

  async execute(args: Record<string, unknown>): Promise<unknown> {
    return this.client.callTool(this.toolName, args);
  }
}
