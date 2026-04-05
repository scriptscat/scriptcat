import { describe, expect, it, vi } from "vitest";
import type { AgentModelSafeConfig, ModelApiRequest } from "@App/app/service/agent/core/types";

// 直接导入以触发装饰器注册
import CATAgentModelApi from "./cat_agent_model";
import { GMContextApiGet } from "./gm_context";

describe.concurrent("CATAgentModelApi", () => {
  it.concurrent("装饰器注册了 list/get/getDefault 三个方法到 CAT.agent.model grant", () => {
    // 触发装饰器
    void CATAgentModelApi;
    const apis = GMContextApiGet("CAT.agent.model");
    expect(apis).toBeDefined();
    const fnKeys = apis!.map((a) => a.fnKey);
    expect(fnKeys).toContain("CAT.agent.model.list");
    expect(fnKeys).toContain("CAT.agent.model.get");
    expect(fnKeys).toContain("CAT.agent.model.getDefault");
  });

  it.concurrent("list 方法调用 sendMessage 并传递正确的请求", async () => {
    const mockSendMessage = vi
      .fn()
      .mockResolvedValue([
        { id: "m1", name: "GPT-4o", provider: "openai", apiBaseUrl: "https://api.openai.com", model: "gpt-4o" },
      ] as AgentModelSafeConfig[]);

    const ctx = {
      sendMessage: mockSendMessage,
      scriptRes: { uuid: "test-uuid" },
    };

    const apis = GMContextApiGet("CAT.agent.model")!;
    const listApi = apis.find((a) => a.fnKey === "CAT.agent.model.list")!;
    const result = await listApi.api.call(ctx);

    expect(mockSendMessage).toHaveBeenCalledWith("CAT_agentModel", [
      { action: "list", scriptUuid: "test-uuid" } as ModelApiRequest,
    ]);
    expect(result).toHaveLength(1);
    expect((result as AgentModelSafeConfig[])[0].name).toBe("GPT-4o");
  });

  it.concurrent("get 方法传递 id 参数", async () => {
    const mockModel: AgentModelSafeConfig = {
      id: "m1",
      name: "Claude",
      provider: "anthropic",
      apiBaseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-20250514",
    };
    const mockSendMessage = vi.fn().mockResolvedValue(mockModel);

    const ctx = {
      sendMessage: mockSendMessage,
      scriptRes: { uuid: "test-uuid" },
    };

    const apis = GMContextApiGet("CAT.agent.model")!;
    const getApi = apis.find((a) => a.fnKey === "CAT.agent.model.get")!;
    const result = await getApi.api.call(ctx, "m1");

    expect(mockSendMessage).toHaveBeenCalledWith("CAT_agentModel", [
      { action: "get", id: "m1", scriptUuid: "test-uuid" } as ModelApiRequest,
    ]);
    expect((result as AgentModelSafeConfig).provider).toBe("anthropic");
  });

  it.concurrent("getDefault 方法返回默认模型 ID", async () => {
    const mockSendMessage = vi.fn().mockResolvedValue("m1");

    const ctx = {
      sendMessage: mockSendMessage,
      scriptRes: { uuid: "test-uuid" },
    };

    const apis = GMContextApiGet("CAT.agent.model")!;
    const getDefaultApi = apis.find((a) => a.fnKey === "CAT.agent.model.getDefault")!;
    const result = await getDefaultApi.api.call(ctx);

    expect(mockSendMessage).toHaveBeenCalledWith("CAT_agentModel", [
      { action: "getDefault", scriptUuid: "test-uuid" } as ModelApiRequest,
    ]);
    expect(result).toBe("m1");
  });

  it.concurrent("scriptRes 为空时使用空字符串作为 scriptUuid", async () => {
    const mockSendMessage = vi.fn().mockResolvedValue([]);

    const ctx = {
      sendMessage: mockSendMessage,
      scriptRes: undefined,
    };

    const apis = GMContextApiGet("CAT.agent.model")!;
    const listApi = apis.find((a) => a.fnKey === "CAT.agent.model.list")!;
    await listApi.api.call(ctx);

    expect(mockSendMessage).toHaveBeenCalledWith("CAT_agentModel", [
      { action: "list", scriptUuid: "" } as ModelApiRequest,
    ]);
  });
});
