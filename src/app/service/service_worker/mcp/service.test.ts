import { describe, it, expect, beforeEach, vi } from "vitest";
import { McpUIService } from "./service";
import { McpOperationDAO } from "@App/app/repo/mcp";
import { McpApprovalService } from "./approval";
import { ScriptDAO, ScriptCodeDAO } from "@App/app/repo/scripts";
import { TempStorageDAO } from "@App/app/repo/tempStorage";
import { createMockOPFS } from "@App/app/repo/test-helpers";
import type { SystemConfig } from "@App/pkg/config/config";

describe("McpUIService（外部接入页端点）", () => {
  let approval: McpApprovalService;
  let controller: {
    getStatus: ReturnType<typeof vi.fn>;
    enroll: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };
  let systemConfig: { setMcpPairing: ReturnType<typeof vi.fn>; setMcpEnabled: ReturnType<typeof vi.fn> };
  let handlers: Record<string, (...args: any[]) => any>;
  let service: McpUIService;

  beforeEach(() => {
    chrome.storage.local.clear();
    createMockOPFS();
    const mutator = { installScript: vi.fn(), enableScript: vi.fn(), deleteScript: vi.fn() };
    approval = new McpApprovalService(
      mutator,
      new ScriptDAO(),
      new ScriptCodeDAO(),
      new McpOperationDAO(),
      new TempStorageDAO()
    );
    controller = { getStatus: vi.fn().mockReturnValue("connected"), enroll: vi.fn(), stop: vi.fn() };
    systemConfig = { setMcpPairing: vi.fn(), setMcpEnabled: vi.fn() };
    handlers = {};
    const group = { on: (name: string, fn: (...args: any[]) => any) => (handlers[name] = fn) } as any;
    service = new McpUIService(group, controller as any, approval, systemConfig as unknown as SystemConfig);
    service.init();
  });

  it("init 注册的端点仅限扁平信任所需的集合", () => {
    expect(Object.keys(handlers).sort()).toEqual(
      [
        "enroll",
        "operation",
        "operationDecision",
        "operationReopen",
        "pendingOperations",
        "status",
        "stopExternalAccess",
      ].sort()
    );
  });

  it("status 返回控制器状态", () => {
    expect(handlers["status"]()).toBe("connected");
  });

  it("enroll 转发配对码给控制器", () => {
    handlers["enroll"]("CODE-1234");
    expect(controller.enroll).toHaveBeenCalledWith("CODE-1234");
  });

  it("operationDecision 透传 enable / rememberSession 给 approval.decide", () => {
    const decide = vi
      .spyOn(approval, "decide")
      .mockResolvedValue({ operationId: "op", kind: "install", status: "approved" });
    handlers["operationDecision"]({ operationId: "op", approved: true, enable: true, rememberSession: true });
    expect(decide).toHaveBeenCalledWith("op", true, { enable: true, rememberSession: true });
  });

  it("stopExternalAccess 废弃密钥 K、清本会话授权、停止并关闭开关", async () => {
    const clear = vi.spyOn(approval, "clearSessionAllow").mockResolvedValue(undefined);
    await handlers["stopExternalAccess"]();
    expect(systemConfig.setMcpPairing).toHaveBeenCalledWith(undefined);
    expect(clear).toHaveBeenCalled();
    expect(controller.stop).toHaveBeenCalled();
    expect(systemConfig.setMcpEnabled).toHaveBeenCalledWith(false);
  });
});
