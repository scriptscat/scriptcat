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
import { sha256OfText } from "@App/pkg/utils/crypto";
import { MAX_SOURCE_BYTES } from "./source";
import * as utilsModule from "@App/pkg/utils/utils";

const VALID_SCRIPT_CODE = `// ==UserScript==
// @name Demo
// @namespace test-ns
// @version 1.0.0
// ==/UserScript==
console.log("hi");`;

// 编辑要走 prepareScriptByCode 重新解析，目标脚本的代码必须是带完整元数据块的真实脚本。
const EDIT_TARGET_CODE = `// ==UserScript==
// @name Seed
// @namespace test-ns
// @version 1.0.0
// ==/UserScript==
console.log("v1");`;

const EDIT_ORIGIN = "https://example.com/seed.user.js";

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

  async function seedScript(uuid: string, code = "console.log('v1')", overrides: Record<string, unknown> = {}) {
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
      ...overrides,
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

  it("内联安装代码不受 512 KiB 人为门槛限制", async () => {
    const code = `${VALID_SCRIPT_CODE}\n// ${"x".repeat(600 * 1024)}`;
    await expect(approval.prepareInstall({ clientId: "c", code, requestId: "r1" })).resolves.toEqual(
      expect.objectContaining({ operationId: expect.any(String) })
    );
  });

  it("批准安装默认启用（enable:true 即装即用），回发 JSON-RPC result", async () => {
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

  it("未命中会话授权时 present 打开确认页、聚焦其浏览器窗口且操作保持待批", async () => {
    await seedScript(TARGET_UUID);
    const ref = await approval.requestDelete({ clientId: "c", uuid: TARGET_UUID, requestId: "r1" });
    const windowsUpdate = vi.fn().mockResolvedValue(undefined);
    const originalChrome = globalThis.chrome;
    (utilsModule.openInCurrentTab as ReturnType<typeof vi.fn>).mockResolvedValue({ windowId: 7 } as chrome.tabs.Tab);
    vi.stubGlobal("chrome", {
      ...originalChrome,
      windows: { update: windowsUpdate },
    });

    try {
      await approval.present(ref.operationId);
      expect(utilsModule.openInCurrentTab).toHaveBeenCalledWith(
        `/src/external_access_confirm.html?op=${ref.operationId}`
      );
      expect(windowsUpdate).toHaveBeenCalledWith(7, { focused: true });
      expect((await operationDAO.get(ref.operationId))?.status).toBe("awaiting_user");
    } finally {
      vi.stubGlobal("chrome", originalChrome);
    }
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

  it("连接断开会作废全部待批操作，旧确认页不能再写入", async () => {
    await seedScript(TARGET_UUID);
    const toggle = await approval.requestToggle({ clientId: "c", uuid: TARGET_UUID, enable: false, requestId: "r1" });
    const removal = await approval.requestDelete({ clientId: "c", uuid: TARGET_UUID, requestId: "r2" });
    await approval.cancelAllPending();
    expect((await operationDAO.get(toggle.operationId))?.status).toBe("cancelled");
    expect((await operationDAO.get(removal.operationId))?.status).toBe("cancelled");
    await expect(approval.decide(removal.operationId, true)).rejects.toMatchObject({ code: "OPERATION_EXPIRED" });
    expect(mutator.deleteScript).not.toHaveBeenCalled();
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

  it("批准全文读取后仍执行请求时携带的响应预算", async () => {
    await seedScript(TARGET_UUID, "0123456789abcdef");
    const ref = await approval.requestSourceDisclosure({
      clientId: "c",
      uuid: TARGET_UUID,
      requestId: "r1",
      form: { form: "full", maxBytes: 8 },
    });

    await expect(approval.decide(ref.operationId, true)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    expect(responder).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "PAYLOAD_TOO_LARGE" }) })
    );
  });

  it("批准 grep 披露时回发匹配结果而非整份源码", async () => {
    await seedScript(TARGET_UUID, "line1\nsecret line2\nline3");
    const ref = await approval.requestSourceDisclosure({
      clientId: "c",
      uuid: TARGET_UUID,
      requestId: "r1",
      form: { form: "grep", query: "secret", mode: "text", ignoreCase: false, contextLines: 0, maxMatches: 50 },
    });
    await approval.decide(ref.operationId, true);
    expect(responder).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({
        ok: true,
        result: expect.objectContaining({ matches: [expect.objectContaining({ lineNumber: 2 })] }),
      })
    );
    const [, response] = responder.mock.calls[0];
    expect(response.result).not.toHaveProperty("code");
  });

  it("源码读取的本会话授权按单个脚本复用，get 与 grep 共用授权", async () => {
    await seedScript(TARGET_UUID, "line1\nsecret line2");
    const first = await approval.requestSourceDisclosure({ clientId: "c", uuid: TARGET_UUID, requestId: "r1" });
    await approval.decide(first.operationId, true, { rememberSession: true });
    (utilsModule.openInCurrentTab as ReturnType<typeof vi.fn>).mockClear();

    const second = await approval.requestSourceDisclosure({
      clientId: "c",
      uuid: TARGET_UUID,
      requestId: "r2",
      form: { form: "grep", query: "secret", mode: "text", ignoreCase: false, contextLines: 0, maxMatches: 50 },
    });
    await approval.present(second.operationId);

    expect(utilsModule.openInCurrentTab).not.toHaveBeenCalled();
    expect((await operationDAO.get(second.operationId))?.status).toBe("approved");
    expect(responder).toHaveBeenCalledWith(
      "r2",
      expect.objectContaining({ ok: true, result: expect.objectContaining({ totalMatches: 1 }) })
    );
  });

  it("同一脚本上整份读取与 grep 挂起态不合并，各自按其形态产出正确结果", async () => {
    await seedScript(TARGET_UUID, "alpha\nbeta secret\ngamma");
    const fullRef = await approval.requestSourceDisclosure({ clientId: "c", uuid: TARGET_UUID, requestId: "r-full" });
    const grepRef = await approval.requestSourceDisclosure({
      clientId: "c",
      uuid: TARGET_UUID,
      requestId: "r-grep",
      form: { form: "grep", query: "secret", mode: "text", ignoreCase: false, contextLines: 0, maxMatches: 50 },
    });
    expect(grepRef.operationId).not.toBe(fullRef.operationId);
    expect(await operationDAO.awaitingUser()).toHaveLength(2);

    await approval.decide(fullRef.operationId, true);
    await approval.decide(grepRef.operationId, true);

    expect(responder).toHaveBeenCalledWith(
      "r-full",
      expect.objectContaining({ ok: true, result: expect.objectContaining({ code: "alpha\nbeta secret\ngamma" }) })
    );
    expect(responder).toHaveBeenCalledWith(
      "r-grep",
      expect.objectContaining({
        ok: true,
        result: expect.objectContaining({ matches: [expect.objectContaining({ lineNumber: 2 })] }),
      })
    );
  });

  it("形态与参数相同但 requestId 不同的 grep 请求分别保留终态响应", async () => {
    await seedScript(TARGET_UUID);
    const form = {
      form: "grep" as const,
      query: "x",
      mode: "text" as const,
      ignoreCase: false,
      contextLines: 0,
      maxMatches: 50,
    };
    const ref1 = await approval.requestSourceDisclosure({ clientId: "c", uuid: TARGET_UUID, requestId: "r1", form });
    const ref2 = await approval.requestSourceDisclosure({ clientId: "c", uuid: TARGET_UUID, requestId: "r2", form });
    expect(ref2.operationId).not.toBe(ref1.operationId);
    expect(await operationDAO.awaitingUser()).toHaveLength(2);
  });

  it("query 不同的 grep 请求不去重合并，各自是独立待批操作", async () => {
    await seedScript(TARGET_UUID);
    const ref1 = await approval.requestSourceDisclosure({
      clientId: "c",
      uuid: TARGET_UUID,
      requestId: "r1",
      form: { form: "grep", query: "x", mode: "text", ignoreCase: false, contextLines: 0, maxMatches: 50 },
    });
    const ref2 = await approval.requestSourceDisclosure({
      clientId: "c",
      uuid: TARGET_UUID,
      requestId: "r2",
      form: { form: "grep", query: "y", mode: "text", ignoreCase: false, contextLines: 0, maxMatches: 50 },
    });
    expect(ref2.operationId).not.toBe(ref1.operationId);
    expect(await operationDAO.awaitingUser()).toHaveLength(2);
  });

  it("clearSessionAllow 清空所有本会话授权", async () => {
    await seedScript(TARGET_UUID);
    const ref = await approval.requestToggle({ clientId: "c", uuid: TARGET_UUID, enable: true, requestId: "r1" });
    await approval.decide(ref.operationId, true, { rememberSession: true });
    expect(await sessionAllow.has(`enable:${TARGET_UUID}`)).toBe(true);
    await approval.clearSessionAllow();
    expect(await sessionAllow.has(`enable:${TARGET_UUID}`)).toBe(false);
  });

  it("直接允许路径（无 requestId）不回发 JSON-RPC result", async () => {
    const ref = await approval.prepareInstall({ clientId: "c", code: VALID_SCRIPT_CODE });
    await approval.decide(ref.operationId, true, { enable: false });
    expect(mutator.installScript.mock.calls[0][0].script.status).toBe(SCRIPT_STATUS_DISABLE);
    expect(responder).not.toHaveBeenCalled();
  });

  describe("requestEdit（scripts.edit.request 的 kind=update 操作）", () => {
    const editV1toV2 = [{ oldText: 'console.log("v1")', newText: 'console.log("v2")' }];
    const EDITED_CODE = EDIT_TARGET_CODE.replace('console.log("v1")', 'console.log("v2")');

    async function seedEditTarget(overrides: Record<string, unknown> = {}) {
      await seedScript(TARGET_UUID, EDIT_TARGET_CODE, { origin: EDIT_ORIGIN, ...overrides });
    }

    it("创建的操作带目标 origin、扩展自算的 existingCodeHash 与新全文 contentHash", async () => {
      await seedEditTarget();
      const ref = await approval.requestEdit({
        clientId: "c",
        uuid: TARGET_UUID,
        edits: editV1toV2,
        requestId: "r1",
      });
      const op = await operationDAO.get(ref.operationId);
      expect(op?.kind).toBe("update");
      expect(op?.targetUuid).toBe(TARGET_UUID);
      expect(op?.stagedUuid).toBe(TARGET_UUID);
      // origin 留空会让 parseScriptFromCode 把脚本的 downloadUrl/checkUpdateUrl 抹成空，从此收不到上游更新。
      expect(op?.sourceUrl).toBe(EDIT_ORIGIN);
      expect(op?.existingCodeHash).toBe(sha256OfText(EDIT_TARGET_CODE));
      expect(op?.contentHash).toBe(sha256OfText(EDITED_CODE));
      expect(op?.sessionKey).toBe(`install:${TARGET_UUID}`);
    });

    it("present 把编辑送到安装页而非紧凑确认页（安装页才有 diff 与权限卡）", async () => {
      await seedEditTarget();
      const ref = await approval.requestEdit({ clientId: "c", uuid: TARGET_UUID, edits: editV1toV2, requestId: "r1" });
      await approval.present(ref.operationId);
      expect(utilsModule.openInCurrentTab).toHaveBeenCalledWith(`/src/install.html?uuid=${TARGET_UUID}`);
    });

    it("批准后按新全文安装，未显式给 enable 时保留脚本原有的启用状态", async () => {
      // 目标必须是「已启用」：未显式传 enable 时无条件覆盖会算出 DISABLE，从禁用态出发的断言看不出差别。
      await seedEditTarget({ status: SCRIPT_STATUS_ENABLE });
      const ref = await approval.requestEdit({ clientId: "c", uuid: TARGET_UUID, edits: editV1toV2, requestId: "r1" });
      await approval.decide(ref.operationId, true);
      const installed = mutator.installScript.mock.calls[0][0];
      expect(installed.code).toBe(EDITED_CODE);
      expect(installed.script.status).toBe(SCRIPT_STATUS_ENABLE);
      expect(responder).toHaveBeenCalledWith("r1", expect.objectContaining({ ok: true }));
    });

    it("用户在安装页动了启用开关时以开关为准，覆盖脚本原有状态", async () => {
      await seedEditTarget({ status: SCRIPT_STATUS_ENABLE });
      const ref = await approval.requestEdit({ clientId: "c", uuid: TARGET_UUID, edits: editV1toV2 });
      await approval.decide(ref.operationId, true, { enable: false });
      expect(mutator.installScript.mock.calls[0][0].script.status).toBe(SCRIPT_STATUS_DISABLE);
    });

    it("编辑的本会话授权按单个脚本复用，后续不同代码免重复确认", async () => {
      await seedEditTarget({ status: SCRIPT_STATUS_ENABLE });
      const first = await approval.requestEdit({ clientId: "c", uuid: TARGET_UUID, edits: editV1toV2 });
      await approval.decide(first.operationId, true, { rememberSession: true });

      (utilsModule.openInCurrentTab as ReturnType<typeof vi.fn>).mockClear();
      const second = await approval.requestEdit({
        clientId: "c",
        uuid: TARGET_UUID,
        edits: [{ oldText: 'console.log("v1")', newText: 'console.log("v3")' }],
        requestId: "r2",
      });
      await approval.present(second.operationId);
      expect(utilsModule.openInCurrentTab).not.toHaveBeenCalled();
      expect((await operationDAO.get(second.operationId))?.status).toBe("approved");
      expect(mutator.installScript).toHaveBeenCalledTimes(2);
    });

    it("TOCTOU：受理后目标脚本代码被改动，批准时报 CONFLICT 且不写入", async () => {
      await seedEditTarget();
      const ref = await approval.requestEdit({ clientId: "c", uuid: TARGET_UUID, edits: editV1toV2, requestId: "r1" });
      await scriptCodeDAO.save({ uuid: TARGET_UUID, code: `${EDIT_TARGET_CODE}\n// tampered` } as any);
      await expect(approval.decide(ref.operationId, true)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mutator.installScript).not.toHaveBeenCalled();
    });

    it("不同 requestId 的相同编辑请求分别保留终态响应", async () => {
      await seedEditTarget();
      const ref1 = await approval.requestEdit({ clientId: "c", uuid: TARGET_UUID, edits: editV1toV2, requestId: "r1" });
      const ref2 = await approval.requestEdit({ clientId: "c", uuid: TARGET_UUID, edits: editV1toV2, requestId: "r2" });
      expect(ref2.operationId).not.toBe(ref1.operationId);
      expect(await operationDAO.awaitingUser()).toHaveLength(2);
    });

    it("结果不同的编辑请求各自独立挂起，不被去重合并", async () => {
      await seedEditTarget();
      const ref1 = await approval.requestEdit({ clientId: "c", uuid: TARGET_UUID, edits: editV1toV2, requestId: "r1" });
      const ref2 = await approval.requestEdit({
        clientId: "c",
        uuid: TARGET_UUID,
        edits: [{ oldText: 'console.log("v1")', newText: 'console.log("v3")' }],
        requestId: "r2",
      });
      expect(ref2.operationId).not.toBe(ref1.operationId);
      expect(await operationDAO.awaitingUser()).toHaveLength(2);
    });

    it("拼出的新全文超过 2 MiB 报 PAYLOAD_TOO_LARGE，且不创建待批操作", async () => {
      await seedEditTarget();
      await expect(
        approval.requestEdit({
          clientId: "c",
          uuid: TARGET_UUID,
          edits: [{ oldText: '"v1"', newText: `"${"x".repeat(MAX_SOURCE_BYTES)}"` }],
        })
      ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
      expect(await operationDAO.awaitingUser()).toHaveLength(0);
    });

    it("目标脚本不存在报 NOT_FOUND", async () => {
      await expect(approval.requestEdit({ clientId: "c", uuid: TARGET_UUID, edits: editV1toV2 })).rejects.toMatchObject(
        { code: "NOT_FOUND" }
      );
    });
  });
});
