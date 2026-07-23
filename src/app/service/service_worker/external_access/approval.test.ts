import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExternalAccessApprovalService, type ExternalAccessScriptMutator, type SendBridgeResponse } from "./approval";
import { ExternalAccessOperationDAO } from "@App/app/repo/external_access";
import { SessionAllowStore } from "./session_allow";
import {
  ScriptDAO,
  ScriptCodeDAO,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import { TempStorageDAO } from "@App/app/repo/tempStorage";
import { createMockOPFS } from "@App/app/repo/test-helpers";
import * as utilsModule from "@App/pkg/utils/utils";

const VALID_SCRIPT_CODE = `// ==UserScript==
// @name Demo
// @namespace test-ns
// @version 1.0.0
// ==/UserScript==
console.log("hi");`;

const TARGET_UUID = "22222222-2222-4222-8222-222222222222";

describe("ExternalAccessApprovalService（三档决策 + 会话授权）", () => {
  let approval: ExternalAccessApprovalService;
  let scriptDAO: ScriptDAO;
  let scriptCodeDAO: ScriptCodeDAO;
  let operationDAO: ExternalAccessOperationDAO;
  let sessionAllow: SessionAllowStore;
  let responder: ReturnType<typeof vi.fn>;
  let mutator: ExternalAccessScriptMutator & {
    installScript: ReturnType<typeof vi.fn>;
    enableScript: ReturnType<typeof vi.fn>;
    deleteScript: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    chrome.storage.local.clear();
    await chrome.storage.session.clear();
    createMockOPFS();
    vi.spyOn(utilsModule, "openInCurrentTab").mockResolvedValue(undefined);
    scriptDAO = new ScriptDAO();
    scriptCodeDAO = new ScriptCodeDAO();
    operationDAO = new ExternalAccessOperationDAO();
    sessionAllow = new SessionAllowStore();
    mutator = {
      installScript: vi.fn().mockResolvedValue({ update: false, updatetime: Date.now() }),
      enableScript: vi.fn().mockResolvedValue(undefined),
      deleteScript: vi.fn().mockResolvedValue(undefined),
    };
    approval = new ExternalAccessApprovalService(
      mutator,
      scriptDAO,
      scriptCodeDAO,
      operationDAO,
      new TempStorageDAO(),
      sessionAllow
    );
    responder = vi.fn();
    approval.setResponder(responder as SendBridgeResponse);
  });

  afterEach(() => vi.restoreAllMocks());

  async function seedScript(uuid: string, code = "console.log('v1')") {
    await scriptDAO.save({
      uuid,
      name: "Seed",
      author: "dao",
      namespace: "test-ns",
      originDomain: "",
      origin: "",
      checkUpdate: true,
      checkUpdateUrl: "",
      downloadUrl: "",
      config: undefined,
      metadata: { name: ["Seed"], namespace: ["test-ns"], version: ["1.0.0"] } as any,
      selfMetadata: {},
      sort: -1,
      type: SCRIPT_TYPE_NORMAL,
      status: SCRIPT_STATUS_ENABLE,
      runStatus: "complete",
      createtime: Date.now(),
      updatetime: Date.now(),
      checktime: Date.now(),
    } as any);
    await scriptCodeDAO.save({ uuid, code } as any);
  }

  it("prepareInstall 暂存代码并按 namespace:name 生成 sessionKey", async () => {
    const ref = await approval.prepareInstall({ clientId: "c", code: VALID_SCRIPT_CODE, requestId: "r1" });
    const op = await operationDAO.get(ref.operationId);
    expect(op?.kind).toBe("install");
    expect(op?.sessionKey).toBe("install:test-ns:Demo");
    expect(op?.requestId).toBe("r1");
    expect(op?.stagedUuid).toBeTruthy();
  });

  it("批准安装默认启用（enable:true 即装即用），回发 bridge.response", async () => {
    const ref = await approval.prepareInstall({ clientId: "c", code: VALID_SCRIPT_CODE, requestId: "r1" });
    await approval.decide(ref.operationId, true, { enable: true });
    expect(mutator.installScript).toHaveBeenCalled();
    expect(mutator.installScript.mock.calls[0][0].script.status).toBe(SCRIPT_STATUS_ENABLE);
    expect(responder).toHaveBeenCalledWith("r1", expect.objectContaining({ ok: true }));
  });

  it("拒绝安装回发 USER_REJECTED，且操作转为 rejected", async () => {
    const ref = await approval.prepareInstall({ clientId: "c", code: VALID_SCRIPT_CODE, requestId: "r1" });
    await approval.decide(ref.operationId, false);
    expect(mutator.installScript).not.toHaveBeenCalled();
    expect(responder).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "USER_REJECTED" }) })
    );
    expect((await operationDAO.get(ref.operationId))?.status).toBe("rejected");
  });

  it("「本会话允许」批准后，同一 (脚本, 操作类别) 的后续请求由 present 免弹自动批准", async () => {
    await seedScript(TARGET_UUID);
    const ref1 = await approval.requestToggle({ clientId: "c", uuid: TARGET_UUID, enable: false, requestId: "r1" });
    await approval.decide(ref1.operationId, true, { rememberSession: true });
    expect(await sessionAllow.has(`disable:${TARGET_UUID}`)).toBe(true);

    // 第二次同类请求：present 命中会话授权，自动批准，不打开确认页。
    (utilsModule.openInCurrentTab as ReturnType<typeof vi.fn>).mockClear();
    const ref2 = await approval.requestToggle({ clientId: "c", uuid: TARGET_UUID, enable: false, requestId: "r2" });
    await approval.present(ref2.operationId);
    expect(utilsModule.openInCurrentTab).not.toHaveBeenCalled();
    expect((await operationDAO.get(ref2.operationId))?.status).toBe("approved");
    expect(responder).toHaveBeenCalledWith("r2", expect.objectContaining({ ok: true }));
  });

  it("未命中会话授权时 present 打开确认页且操作保持待批", async () => {
    await seedScript(TARGET_UUID);
    const ref = await approval.requestDelete({ clientId: "c", uuid: TARGET_UUID, requestId: "r1" });
    await approval.present(ref.operationId);
    expect(utilsModule.openInCurrentTab).toHaveBeenCalledWith(
      `/src/external_access_confirm.html?op=${ref.operationId}`
    );
    expect((await operationDAO.get(ref.operationId))?.status).toBe("awaiting_user");
  });

  it("TOCTOU：批准前目标脚本代码变化则 enable 返回 CONFLICT", async () => {
    await seedScript(TARGET_UUID, "console.log('v1')");
    const ref = await approval.requestToggle({ clientId: "c", uuid: TARGET_UUID, enable: false, requestId: "r1" });
    await scriptCodeDAO.save({ uuid: TARGET_UUID, code: "console.log('tampered')" } as any);
    await expect(approval.decide(ref.operationId, true)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mutator.enableScript).not.toHaveBeenCalled();
  });

  it("断开作废：cancelByRequestId 后再次 decide 命中 awaiting_user 闸门抛 OPERATION_EXPIRED", async () => {
    await seedScript(TARGET_UUID);
    const ref = await approval.requestDelete({ clientId: "c", uuid: TARGET_UUID, requestId: "r1" });
    await approval.cancelByRequestId("r1");
    expect((await operationDAO.get(ref.operationId))?.status).toBe("cancelled");
    await expect(approval.decide(ref.operationId, true)).rejects.toMatchObject({ code: "OPERATION_EXPIRED" });
  });

  it("批准源码读取时回发完整源码", async () => {
    await seedScript(TARGET_UUID, "console.log('secret')");
    const ref = await approval.requestSourceDisclosure({ clientId: "c", uuid: TARGET_UUID, requestId: "r1" });
    await approval.decide(ref.operationId, true);
    expect(responder).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ ok: true, result: expect.objectContaining({ code: "console.log('secret')" }) })
    );
  });

  it("clearSessionAllow 清空所有本会话授权", async () => {
    await seedScript(TARGET_UUID);
    const ref = await approval.requestToggle({ clientId: "c", uuid: TARGET_UUID, enable: true, requestId: "r1" });
    await approval.decide(ref.operationId, true, { rememberSession: true });
    expect(await sessionAllow.has(`enable:${TARGET_UUID}`)).toBe(true);
    await approval.clearSessionAllow();
    expect(await sessionAllow.has(`enable:${TARGET_UUID}`)).toBe(false);
  });

  it("直接允许路径（无 requestId）不回发 bridge.response", async () => {
    const ref = await approval.prepareInstall({ clientId: "c", code: VALID_SCRIPT_CODE });
    await approval.decide(ref.operationId, true, { enable: false });
    expect(mutator.installScript.mock.calls[0][0].script.status).toBe(SCRIPT_STATUS_DISABLE);
    expect(responder).not.toHaveBeenCalled();
  });
});
