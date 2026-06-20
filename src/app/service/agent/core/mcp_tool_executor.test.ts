import { describe, it, expect, vi } from "vitest";
import { MCPToolExecutor } from "./mcp_tool_executor";
import type { MCPClient } from "./mcp_client";

function createMockClient(callToolResult: unknown): MCPClient {
  return {
    callTool: vi.fn().mockResolvedValue(callToolResult),
  } as unknown as MCPClient;
}

describe("MCPToolExecutor", () => {
  it("应将参数透传给 MCPClient.callTool 并返回结果", async () => {
    const client = createMockClient("tool result");
    const executor = new MCPToolExecutor(client, "search");

    const result = await executor.execute({ query: "hello" });

    expect(result).toBe("tool result");
    expect(client.callTool).toHaveBeenCalledWith("search", { query: "hello" });
  });

  it("应正确传递工具名", async () => {
    const client = createMockClient({ data: [1, 2, 3] });
    const executor = new MCPToolExecutor(client, "fetch_data");

    const result = await executor.execute({ limit: 10 });

    expect(result).toEqual({ data: [1, 2, 3] });
    expect(client.callTool).toHaveBeenCalledWith("fetch_data", { limit: 10 });
  });

  it("callTool 抛出异常时应向上传播", async () => {
    const client = {
      callTool: vi.fn().mockRejectedValue(new Error("MCP error")),
    } as unknown as MCPClient;
    const executor = new MCPToolExecutor(client, "failing_tool");

    await expect(executor.execute({})).rejects.toThrow("MCP error");
  });

  it("包含 image 类型的 content 应转换为 ToolResultWithAttachments", async () => {
    const mcpContent = [
      { type: "text", text: "Here is the screenshot" },
      { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
    ];
    const client = createMockClient(mcpContent);
    const executor = new MCPToolExecutor(client, "screenshot_tool");

    const result = await executor.execute({});

    expect(result).toEqual({
      content: "Here is the screenshot",
      attachments: [
        {
          type: "image",
          name: "image.png",
          mimeType: "image/png",
          data: "data:image/png;base64,iVBORw0KGgo=",
        },
      ],
    });
  });

  it("多个 image 内容应全部转换为附件", async () => {
    const mcpContent = [
      { type: "image", data: "abc123", mimeType: "image/jpeg" },
      { type: "image", data: "def456", mimeType: "image/png" },
    ];
    const client = createMockClient(mcpContent);
    const executor = new MCPToolExecutor(client, "multi_image");

    const result = (await executor.execute({})) as any;

    expect(result.content).toBe("Tool completed.");
    expect(result.attachments).toHaveLength(2);
    expect(result.attachments[0].mimeType).toBe("image/jpeg");
    expect(result.attachments[0].name).toBe("image.jpeg");
    expect(result.attachments[1].mimeType).toBe("image/png");
  });

  it("只包含 text 的 content 数组应原样返回", async () => {
    const mcpContent = [
      { type: "text", text: "Line 1" },
      { type: "text", text: "Line 2" },
    ];
    const client = createMockClient(mcpContent);
    const executor = new MCPToolExecutor(client, "text_tool");

    const result = await executor.execute({});

    // 没有 image，原样返回 content 数组
    expect(result).toEqual(mcpContent);
  });

  it("非数组结果应原样返回", async () => {
    const client = createMockClient("plain string result");
    const executor = new MCPToolExecutor(client, "simple_tool");

    const result = await executor.execute({});

    expect(result).toBe("plain string result");
  });

  it("image 缺少 mimeType 时应默认为 image/png", async () => {
    const mcpContent = [{ type: "image", data: "abc123" }];
    const client = createMockClient(mcpContent);
    const executor = new MCPToolExecutor(client, "no_mime");

    const result = (await executor.execute({})) as any;

    expect(result.attachments[0].mimeType).toBe("image/png");
    expect(result.attachments[0].data).toBe("data:image/png;base64,abc123");
  });
});
