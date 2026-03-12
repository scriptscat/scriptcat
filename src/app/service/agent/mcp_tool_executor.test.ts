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
});
