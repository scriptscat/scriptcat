import { describe, it, expect, beforeEach, vi } from "vitest";
import { McpUIService } from "./service";
import { McpClientDAO, McpAuditDAO, McpOperationDAO, type McpClient } from "@App/app/repo/mcp";
import { McpApprovalService } from "./approval";
import { ScriptDAO, ScriptCodeDAO } from "@App/app/repo/scripts";
import { TempStorageDAO } from "@App/app/repo/tempStorage";
import { createMockOPFS } from "@App/app/repo/test-helpers";
import * as utilsModule from "@App/pkg/utils/utils";

function makeClient(overrides: Partial<McpClient> = {}): McpClient {
  return {
    clientId: "client-1",
    displayName: "Test Client",
    tokenHash: "hash",
    scopes: ["scripts:install:request"],
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    revoked: false,
    ...overrides,
  };
}

const VALID_CODE = (name: string) => `// ==UserScript==
// @name ${name}
// @namespace ns
// @version 1.0.0
// ==/UserScript==
console.log(1);`;

describe("McpUIService", () => {
  let clientDAO: McpClientDAO;
  let auditDAO: McpAuditDAO;
  let approval: McpApprovalService;
  let controller: {
    getStatus: ReturnType<typeof vi.fn>;
    setWriteSessionActive: ReturnType<typeof vi.fn>;
    readWriteSessionActive: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    pair: ReturnType<typeof vi.fn>;
    notifyClientRevoked: ReturnType<typeof vi.fn>;
    getPendingPairing: ReturnType<typeof vi.fn>;
    decidePairing: ReturnType<typeof vi.fn>;
  };
  let service: McpUIService;

  beforeEach(async () => {
    chrome.storage.local.clear();
    createMockOPFS();
    vi.spyOn(utilsModule, "openInCurrentTab").mockResolvedValue(undefined);

    clientDAO = new McpClientDAO();
    auditDAO = new McpAuditDAO();
    const scriptDAO = new ScriptDAO();
    const scriptCodeDAO = new ScriptCodeDAO();
    const mutator = { installScript: vi.fn(), enableScript: vi.fn(), deleteScript: vi.fn() };
    approval = new McpApprovalService(
      mutator,
      scriptDAO,
      scriptCodeDAO,
      clientDAO,
      new McpOperationDAO(),
      new TempStorageDAO()
    );
    controller = {
      getStatus: vi.fn().mockReturnValue("connected"),
      setWriteSessionActive: vi.fn(),
      readWriteSessionActive: vi.fn().mockResolvedValue(true),
      stop: vi.fn(),
      pair: vi.fn(),
      notifyClientRevoked: vi.fn(),
      getPendingPairing: vi.fn().mockReturnValue(undefined),
      decidePairing: vi.fn(),
    };

    service = new McpUIService({ on: vi.fn() } as any, controller as any, approval, clientDAO, auditDAO);
    await clientDAO.save(makeClient());
  });

  it("getStatus 返回 controller 的当前状态", () => {
    expect(service.getStatus()).toBe("connected");
  });

  // 页面挂载时必须能读回写会话的真实状态：只写不读会让刷新后的开关显示为关，
  // 而实际写权限仍然开着——用户会据此以为自己已经关掉了授权。
  it("getWriteSession 返回 controller 侧持久化的写会话状态", async () => {
    expect(await service.getWriteSession()).toBe(true);
    expect(controller.readWriteSessionActive).toHaveBeenCalled();
  });

  it("setWriteSession 转发给 controller", () => {
    service.setWriteSession(true);
    expect(controller.setWriteSessionActive).toHaveBeenCalledWith(true);
  });

  it("getClients 返回所有客户端", async () => {
    await clientDAO.save(makeClient({ clientId: "b" }));
    const clients = await service.getClients();
    expect(clients.map((c) => c.clientId).sort()).toEqual(["client-1", "b"].sort());
  });

  it("revokeClient 将该客户端标记为 revoked 并通知 controller", async () => {
    await service.revokeClient("client-1");
    const client = await clientDAO.get("client-1");
    expect(client?.revoked).toBe(true);
    expect(controller.notifyClientRevoked).toHaveBeenCalledWith("client-1");
  });

  it("revokeClient 对不存在的 clientId 静默无操作", async () => {
    await expect(service.revokeClient("missing")).resolves.toBeUndefined();
    expect(controller.notifyClientRevoked).not.toHaveBeenCalled();
  });

  it("revokeAllAndStop 撤销所有客户端并停止桥接", async () => {
    await clientDAO.save(makeClient({ clientId: "b" }));
    await service.revokeAllAndStop();
    const clients = await clientDAO.all();
    expect(clients.every((c) => c.revoked)).toBe(true);
    expect(controller.stop).toHaveBeenCalledTimes(1);
  });

  it("getOperation 返回不带 clientId 过滤的操作详情（人类 UI 拥有最终权威）", async () => {
    const ref = await approval.prepareInstall({
      clientId: "client-1",
      requestingClientName: "Test Client",
      code: VALID_CODE("Svc Target"),
    });
    const op = await service.getOperation(ref.operationId);
    expect(op?.operationId).toBe(ref.operationId);
    expect(op?.requestingClientName).toBe("Test Client");
  });

  it("decideOperation 转发给 approval.decide", async () => {
    const ref = await approval.prepareInstall({
      clientId: "client-1",
      requestingClientName: "Test Client",
      code: VALID_CODE("Svc Decision"),
    });
    const result = await service.decideOperation({ operationId: ref.operationId, approved: false });
    expect(result.status).toBe("rejected");
  });

  it("decideOperation 将 rememberChoice 原样透传给 approval.decide（source_disclosure 用）", async () => {
    const decideSpy = vi.spyOn(approval, "decide");
    const ref = await approval.prepareInstall({
      clientId: "client-1",
      requestingClientName: "Test Client",
      code: VALID_CODE("Svc Remember"),
    });
    await service.decideOperation({ operationId: ref.operationId, approved: false, rememberChoice: "client" });
    expect(decideSpy).toHaveBeenCalledWith(ref.operationId, false, { enable: undefined, rememberChoice: "client" });
  });

  it("getAudit 返回所有审计事件，clearAudit 清空它们", async () => {
    await auditDAO.append({
      eventId: "e1",
      timestamp: Date.now(),
      clientId: "client-1",
      clientName: "Test Client",
      action: "scripts.list",
      decision: "allowed",
      correlationId: "c1",
    });
    expect(await service.getAudit()).toHaveLength(1);
    await service.clearAudit();
    expect(await service.getAudit()).toHaveLength(0);
  });

  it("init() 向 group 注册全部端点", () => {
    const group = { on: vi.fn() };
    const svc = new McpUIService(group as any, controller as any, approval, clientDAO, auditDAO);
    svc.init();
    const registered = group.on.mock.calls.map((call) => call[0]);
    expect(registered.sort()).toEqual(
      [
        "status",
        "setWriteSession",
        "writeSession",
        "clients",
        "revokeClient",
        "revokeAllAndStop",
        "operation",
        "operationDecision",
        "operationReopen",
        "pendingOperations",
        "audit",
        "auditClear",
        "pendingPairing",
        "pairingDecision",
        "pair",
      ].sort()
    );
  });

  it("pair 转发给 controller.pair", () => {
    service.pair("MNBV-3456");
    expect(controller.pair).toHaveBeenCalledWith("MNBV-3456");
  });

  it("reopenOperation 转发给 approval.reopen", async () => {
    const reopenSpy = vi.spyOn(approval, "reopen").mockResolvedValue(undefined);
    await service.reopenOperation("op-42");
    expect(reopenSpy).toHaveBeenCalledWith("op-42");
  });

  it("getPendingOperations 转发给 approval.listPending", async () => {
    const listSpy = vi.spyOn(approval, "listPending").mockResolvedValue([]);
    await service.getPendingOperations();
    expect(listSpy).toHaveBeenCalledTimes(1);
  });

  it("getPendingPairing 转发给 controller", () => {
    controller.getPendingPairing.mockReturnValue({
      pairingId: "p1",
      clientName: "Claude Desktop",
      requestedScopes: ["scripts:list"],
      code: "ABCD1234",
      expiresAt: Date.now() + 120_000,
    });
    expect(service.getPendingPairing()).toMatchObject({ pairingId: "p1" });
  });

  it("decidePairing 转发给 controller，参数原样传递", () => {
    service.decidePairing({ pairingId: "p1", approved: true, grantedScopes: ["scripts:list"] });
    expect(controller.decidePairing).toHaveBeenCalledWith("p1", true, ["scripts:list"]);
  });
});
