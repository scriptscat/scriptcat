import type { MCPClient } from "./mcp_client";
import type { ToolExecutor } from "./tool_registry";
import type { ToolResultWithAttachments } from "./types";

// MCP 工具执行器，将 ToolExecutor 接口桥接到 MCPClient.callTool
export class MCPToolExecutor implements ToolExecutor {
  constructor(
    private client: MCPClient,
    private toolName: string
  ) {}

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const result = await this.client.callTool(this.toolName, args);

    // 检测 MCP 返回的 content 数组是否包含 image 类型
    if (Array.isArray(result)) {
      const textParts: string[] = [];
      const attachments: ToolResultWithAttachments["attachments"] = [];

      for (const item of result) {
        if (item.type === "text" && item.text) {
          textParts.push(item.text);
        } else if (item.type === "image" && item.data) {
          attachments.push({
            type: "image",
            name: "image." + (item.mimeType?.split("/")[1] || "png"),
            mimeType: item.mimeType || "image/png",
            data: `data:${item.mimeType || "image/png"};base64,${item.data}`,
          });
        }
      }

      if (attachments.length > 0) {
        return {
          content: textParts.join("\n") || "Tool completed.",
          attachments,
        } as ToolResultWithAttachments;
      }
    }

    return result;
  }
}
