import { describe, it, expect, vi } from "vitest";
import { buildModelsRequest, testConnection, fetchModels, getDefaultBaseUrl } from "./provider_api";

const m = {
  id: "1",
  name: "n",
  provider: "openai",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "sk-x",
  model: "gpt-4o",
} as any;

describe("provider_api 直连 HTTP", () => {
  it("openai 拼出 /models 与 Bearer 头", () => {
    const { url, headers } = buildModelsRequest(m);
    expect(url).toBe("https://api.openai.com/v1/models");
    expect(headers.Authorization).toBe("Bearer sk-x");
  });

  it("anthropic 使用 x-api-key 与 /v1/models", () => {
    const { url, headers } = buildModelsRequest({ ...m, provider: "anthropic", apiBaseUrl: "" });
    expect(url).toBe("https://api.anthropic.com/v1/models");
    expect(headers["x-api-key"]).toBe("sk-x");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("provider 缺省 baseUrl 时回退到默认地址", () => {
    expect(getDefaultBaseUrl("openai")).toBe("https://api.openai.com/v1");
    expect(getDefaultBaseUrl("zhipu")).toBe("https://open.bigmodel.cn/api/paas/v4");
  });

  it("testConnection 成功返回 ok 且带延迟", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as any;
    const r = await testConnection(m, fetchImpl);
    expect(r.ok).toBe(true);
    expect(typeof r.latencyMs).toBe("number");
  });

  it("testConnection 失败返回 error", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => "unauthorized" })) as any;
    const r = await testConnection(m, fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("401");
  });

  it("fetchModels 解析 data[].id 列表", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
    })) as any;
    const ids = await fetchModels(m, fetchImpl);
    expect(ids).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });
});
