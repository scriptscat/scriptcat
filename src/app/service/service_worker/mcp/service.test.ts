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
    stop: ReturnType<typeof vi.fn>;
    notifyClientRevoked: ReturnType<typeof vi.fn>;
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
      stop: vi.fn(),
      notifyClientRevoked: vi.fn(),
    };

    service = new McpUIService({ on: vi.fn() } as any, controller as any, approval, clientDAO, auditDAO);
    await clientDAO.save(makeClient());
  });

  it("getStatus 返回 controller 的当前状态", () => {
    expect(service.getStatus()).toBe("connected");
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
        "clients",
        "revokeClient",
        "revokeAllAndStop",
        "operation",
        "operationDecision",
        "audit",
        "auditClear",
      ].sort()
    );
  });
});
