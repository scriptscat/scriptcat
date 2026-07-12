import { describe, it, expect, vi } from "vitest";
import { buildMcpServer } from "./server";

// Deep protocol-level tools/list dispatch is the SDK's own responsibility (McpServer requires a
// connected Transport before it will answer requests) and out of scope here; what this package
// owns and must verify is that registration itself succeeds across every scope combination and
// that it doesn't throw building against the real SDK types — tool/resource *visibility* by
// scope is unit-tested directly against tools.ts's visibleTools() in tools.test.ts.
describe("buildMcpServer - 按 scope 构造 McpServer（doc 03 §5, doc 06 §1）", () => {
  const socketClient = { call: vi.fn() };

  it("只读 scope 时可以成功构造", () => {
    expect(() =>
      buildMcpServer({
        socketClient,
        serverVersion: "0.1.0",
        getScopes: () => ["scripts:list", "scripts:metadata:read"],
      })
    ).not.toThrow();
  });

  it("持有写 scope 时可以成功构造", () => {
    expect(() =>
      buildMcpServer({ socketClient, serverVersion: "0.1.0", getScopes: () => ["scripts:install:request"] })
    ).not.toThrow();
  });

  it("持有 scripts:source:read 时可以成功构造（注册 source 资源）", () => {
    expect(() =>
      buildMcpServer({ socketClient, serverVersion: "0.1.0", getScopes: () => ["scripts:source:read"] })
    ).not.toThrow();
  });

  it("空 scopes 时仍能构造（只注册 server_info 与 operations.* 工具）", () => {
    expect(() => buildMcpServer({ socketClient, serverVersion: "0.1.0", getScopes: () => [] })).not.toThrow();
  });

  it("返回的 server 暴露底层 SDK Server 实例（server.server）", () => {
    const server = buildMcpServer({ socketClient, serverVersion: "0.1.0", getScopes: () => ["scripts:list"] });
    expect(server.server).toBeDefined();
  });
});
