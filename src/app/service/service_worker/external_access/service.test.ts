import { mockIdentityLock } from "./test-locks";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExternalAccessUIService } from "./service";
import { ExternalAccessOperationDAO } from "@App/app/repo/external_access";
import { ExternalAccessApprovalService } from "./approval";
import { ScriptDAO, ScriptCodeDAO } from "@App/app/repo/scripts";
import { TempStorageDAO } from "@App/app/repo/tempStorage";
import { createMockOPFS } from "@App/app/repo/test-helpers";
import { SystemConfig } from "@App/pkg/config/config";
import { MessageQueue } from "@Packages/message/message_queue";

describe("ExternalAccessUIService（外部接入页端点）", () => {
  let approval: ExternalAccessApprovalService;
  let controller: {
    getStatus: ReturnType<typeof vi.fn>;
    enroll: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };
  let systemConfig: SystemConfig;
  let handlers: Record<string, (...args: any[]) => any>;
  let service: ExternalAccessUIService;

  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    chrome.storage.local.clear();
    createMockOPFS();
    const mutator = { installScript: vi.fn(), enableScript: vi.fn(), deleteScript: vi.fn() };
    approval = new ExternalAccessApprovalService(
      mutator,
      new ScriptDAO(),
      new ScriptCodeDAO(),
      new ExternalAccessOperationDAO(),
      new TempStorageDAO()
    );
    controller = {
      getStatus: vi.fn().mockResolvedValue({ status: "connected", daemonVersion: "1.0.0" }),
      enroll: vi.fn().mockResolvedValue("name-taken"),
      rename: vi.fn().mockResolvedValue("applies-next-connection"),
      stop: vi.fn(),
    };
    systemConfig = new SystemConfig(new MessageQueue());
    handlers = {};
    const group = { on: (name: string, fn: (...args: any[]) => any) => (handlers[name] = fn) } as any;
    service = new ExternalAccessUIService(group, controller as any, approval, systemConfig);
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
        "rename",
        "status",
        "stopExternalAccess",
      ].sort()
    );
  });

  it("status 返回控制器状态（含 sctl 版本）", async () => {
    expect(await handlers["status"]()).toEqual({ status: "connected", daemonVersion: "1.0.0" });
  });

  it("接入与改名返回控制器的结果", async () => {
    expect(await handlers["enroll"]({ code: "CODE-1234", name: "work" })).toBe("name-taken");
    expect(controller.enroll).toHaveBeenCalledWith("CODE-1234", "work");
    expect(await handlers["rename"]("work")).toBe("applies-next-connection");
    expect(controller.rename).toHaveBeenCalledWith("work");
  });

  it("operationDecision 透传 enable / rememberSession 给 approval.decide", () => {
    const decide = vi
      .spyOn(approval, "decide")
      .mockResolvedValue({ operationId: "op", kind: "install", status: "approved" });
    handlers["operationDecision"]({ operationId: "op", approved: true, enable: true, rememberSession: true });
    expect(decide).toHaveBeenCalledWith("op", true, { enable: true, rememberSession: true });
  });

  it("stopExternalAccess 废弃密钥但保留实例身份、清本会话授权、停止并关闭开关", async () => {
    mockIdentityLock();
    const identity = await systemConfig.getExternalAccessIdentity();
    systemConfig.setExternalAccessPairing({ key: "test-key" });
    systemConfig.setExternalAccessEnabled(true);
    const clear = vi.spyOn(approval, "clearSessionAllow").mockResolvedValue(undefined);
    await handlers["stopExternalAccess"]();
    expect(await systemConfig.getExternalAccessPairing()).toEqual({ key: "" });
    expect(await new SystemConfig(new MessageQueue()).getExternalAccessIdentity()).toEqual(identity);
    expect(clear).toHaveBeenCalled();
    expect(controller.stop).toHaveBeenCalled();
    expect(await systemConfig.getExternalAccessEnabled()).toBe(false);
  });
});
