import { describe, expect, it, beforeEach } from "vitest";
import { McpClientDAO, McpOperationDAO, McpAuditDAO, MCP_AUDIT_RING_BUFFER_SIZE } from "./mcp";
import type { McpClient, McpOperation, McpAuditEvent } from "./mcp";

function makeClient(overrides: Partial<McpClient> = {}): McpClient {
  return {
    clientId: "client-1",
    displayName: "Test Client",
    tokenHash: "hash-1",
    scopes: ["scripts:list"],
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    revoked: false,
    ...overrides,
  };
}

function makeOperation(overrides: Partial<McpOperation> = {}): McpOperation {
  const now = Date.now();
  return {
    operationId: "op-1",
    clientId: "client-1",
    kind: "install",
    status: "awaiting_user",
    createdAt: now,
    expiresAt: now + 5 * 60_000,
    requestedEnabledState: false,
    ...overrides,
  };
}

function makeAuditEvent(overrides: Partial<McpAuditEvent> = {}): McpAuditEvent {
  return {
    eventId: "evt-1",
    timestamp: Date.now(),
    clientId: "client-1",
    clientName: "Test Client",
    action: "scripts.list",
    decision: "allowed",
    correlationId: "corr-1",
    ...overrides,
  };
}

describe("McpClientDAO", () => {
  let dao: McpClientDAO;

  beforeEach(() => {
    chrome.storage.local.clear();
    dao = new McpClientDAO();
  });

  it("save / get 往返读写一条客户端记录", async () => {
    const client = makeClient();
    await dao.save(client);
    const result = await dao.get(client.clientId);
    expect(result).toEqual(client);
  });

  it("all 返回所有客户端记录", async () => {
    await dao.save(makeClient({ clientId: "a" }));
    await dao.save(makeClient({ clientId: "b" }));
    const all = await dao.all();
    expect(all.map((c) => c.clientId).sort()).toEqual(["a", "b"]);
  });
});

describe("McpOperationDAO", () => {
  let dao: McpOperationDAO;

  beforeEach(() => {
    chrome.storage.local.clear();
    dao = new McpOperationDAO();
  });

  it("save / get 往返读写一条待批操作", async () => {
    const op = makeOperation();
    await dao.save(op);
    const result = await dao.get(op.operationId);
    expect(result).toEqual(op);
  });

  it("byClient 只返回属于该 clientId 的操作", async () => {
    await dao.save(makeOperation({ operationId: "op-a", clientId: "client-a" }));
    await dao.save(makeOperation({ operationId: "op-b", clientId: "client-b" }));
    const forA = await dao.byClient("client-a");
    expect(forA.map((o) => o.operationId)).toEqual(["op-a"]);
  });
});

describe("McpAuditDAO - 环形缓冲", () => {
  let dao: McpAuditDAO;

  beforeEach(() => {
    chrome.storage.local.clear();
    dao = new McpAuditDAO();
  });

  it("append 写入的事件可通过 all 读回", async () => {
    await dao.append(makeAuditEvent({ eventId: "evt-a" }));
    await dao.append(makeAuditEvent({ eventId: "evt-b" }));
    const all = await dao.all();
    expect(all.map((e) => e.eventId).sort()).toEqual(["evt-a", "evt-b"]);
  });

  it(`append 超过 ${MCP_AUDIT_RING_BUFFER_SIZE} 条时裁剪最旧的事件`, async () => {
    for (let i = 0; i < MCP_AUDIT_RING_BUFFER_SIZE + 10; i++) {
      await dao.append(makeAuditEvent({ eventId: `evt-${i}`, timestamp: i }));
    }
    const all = await dao.all();
    expect(all.length).toBe(MCP_AUDIT_RING_BUFFER_SIZE);
    // The 10 oldest (evt-0..evt-9) must have been pruned.
    const ids = new Set(all.map((e) => e.eventId));
    expect(ids.has("evt-0")).toBe(false);
    expect(ids.has("evt-9")).toBe(false);
    expect(ids.has(`evt-${MCP_AUDIT_RING_BUFFER_SIZE + 9}`)).toBe(true);
  });

  it("clear 清空所有审计事件", async () => {
    await dao.append(makeAuditEvent({ eventId: "evt-a" }));
    await dao.clear();
    expect(await dao.all()).toEqual([]);
  });
});
