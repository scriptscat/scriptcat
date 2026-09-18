import type { MCPClient, MCPToolCallResult } from "./mcp_client";
import type { ToolExecutor } from "./tool_registry";
import type { ToolResultWithAttachments } from "./types";

// MCP 工具执行器，将 ToolExecutor 接口桥接到 MCPClient.callTool
export class MCPToolExecutor implements ToolExecutor {
  constructor(
    private client: MCPClient,
    private toolName: string
  ) {}

  async execute(args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const result = await this.client.callTool(this.toolName, args, signal);

    // 检测 MCP 返回的 content 数组是否包含 image 类型
    const structuredResult =
      !Array.isArray(result) &&
      typeof result === "object" &&
      result !== null &&
      Array.isArray((result as { content?: unknown }).content)
        ? (result as MCPToolCallResult)
        : undefined;
    const content = Array.isArray(result) ? result : structuredResult?.content;
    if (content) {
      const textParts: string[] = [];
      const attachments: ToolResultWithAttachments["attachments"] = [];

      for (const item of content) {
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
          content:
            textParts.join("\n") ||
            (structuredResult?.structuredContent !== undefined
              ? JSON.stringify(structuredResult.structuredContent)
              : "Tool completed."),
          attachments,
          ...(structuredResult?.structuredContent !== undefined
            ? { structuredContent: structuredResult.structuredContent }
            : {}),
        } as ToolResultWithAttachments;
      }
    }

    return result;
  }
}
