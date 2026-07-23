import { describe, expect, it, beforeEach } from "vitest";
import { McpOperationDAO } from "./mcp";
import type { McpOperation } from "./mcp";

function makeOperation(overrides: Partial<McpOperation> = {}): McpOperation {
  const now = Date.now();
  return {
    operationId: "op-1",
    clientId: "client-1",
    kind: "install",
    status: "awaiting_user",
    createdAt: now,
    expiresAt: now + 5 * 60_000,
    sessionKey: "install:test-ns:Demo",
    ...overrides,
  };
}

describe("McpOperationDAO", () => {
  let dao: McpOperationDAO;

  beforeEach(() => {
    chrome.storage.local.clear();
    dao = new McpOperationDAO();
  });

  it("save / get 往返读写一条待批操作", async () => {
    const op = makeOperation();
    await dao.save(op);
    expect(await dao.get(op.operationId)).toEqual(op);
  });

  it("byRequestId 按发起请求的 requestId 定位待批操作", async () => {
    await dao.save(makeOperation({ operationId: "op-a", requestId: "req-a" }));
    await dao.save(makeOperation({ operationId: "op-b", requestId: "req-b" }));
    const found = await dao.byRequestId("req-b");
    expect(found?.operationId).toBe("op-b");
  });

  it("awaitingUser 只返回仍在等待用户决策的操作", async () => {
    await dao.save(makeOperation({ operationId: "op-pending", status: "awaiting_user" }));
    await dao.save(makeOperation({ operationId: "op-done", status: "approved" }));
    const pending = await dao.awaitingUser();
    expect(pending.map((o) => o.operationId)).toEqual(["op-pending"]);
  });
});
