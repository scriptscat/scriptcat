import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { McpApprovalService, INLINE_CODE_MAX_BYTES, type McpScriptMutator, type SendBridgeResponse } from "./approval";
import { McpBridgeError } from "./errors";
import { McpClientDAO, McpOperationDAO, type McpClient } from "@App/app/repo/mcp";
import {
  ScriptDAO,
  ScriptCodeDAO,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import { TempStorageDAO } from "@App/app/repo/tempStorage";
import { createMockOPFS } from "@App/app/repo/test-helpers";
import { sha256OfText } from "@App/pkg/utils/crypto";
import * as utilsModule from "@App/pkg/utils/utils";

function validCode(name: string) {
  return `// ==UserScript==
// @name ${name}
// @namespace test-ns
// @version 1.0.0
// ==/UserScript==
console.log("hi");`;
}

// Mirrors url_policy.test.ts's helper — a minimal fetch Response stand-in with a single-chunk
// streaming body, enough for fetchInstallSourceWithPolicy's reader loop.
function makeResponse(opts: { url: string; status?: number; body: string; contentLength?: string }) {
  const bytes = new TextEncoder().encode(opts.body);
  return {
    url: opts.url,
    status: opts.status ?? 200,
    headers: new Headers(opts.contentLength !== undefined ? { "content-length": opts.contentLength } : {}),
    body: {
      getReader() {
        let sent = false;
        return {
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
          cancel: async () => {},
        };
      },
    },
    text: async () => opts.body,
  };
}

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

describe("McpApprovalService", () => {
  let mutator: McpScriptMutator & {
    installScript: ReturnType<typeof vi.fn>;
    enableScript: ReturnType<typeof vi.fn>;
    deleteScript: ReturnType<typeof vi.fn>;
  };
  let clientDAO: McpClientDAO;
  let operationDAO: McpOperationDAO;
  let scriptDAO: ScriptDAO;
  let scriptCodeDAO: ScriptCodeDAO;
  let tempStorageDAO: TempStorageDAO;
  let responder: ReturnType<typeof vi.fn>;
  let service: McpApprovalService;

  beforeEach(async () => {
    createMockOPFS();
    chrome.storage.local.clear();
    vi.spyOn(utilsModule, "openInCurrentTab").mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn());

    mutator = {
      installScript: vi.fn().mockResolvedValue({ update: false, updatetime: Date.now() }),
      enableScript: vi.fn().mockResolvedValue(undefined),
      deleteScript: vi.fn().mockResolvedValue(undefined),
    };
    clientDAO = new McpClientDAO();
    operationDAO = new McpOperationDAO();
    scriptDAO = new ScriptDAO();
    scriptCodeDAO = new ScriptCodeDAO();
    tempStorageDAO = new TempStorageDAO();

    await clientDAO.save(makeClient());

    responder = vi.fn();
    service = new McpApprovalService(mutator, scriptDAO, scriptCodeDAO, clientDAO, operationDAO, tempStorageDAO);
    service.setResponder(responder as unknown as SendBridgeResponse);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("prepareInstall - 暂存但不安装、不弹窗", () => {
    it("暂存代码、计算哈希、创建 awaiting_user 操作，且不调用 installScript，也不自行弹确认页", async () => {
      const code = validCode("Hello");
      const ref = await service.prepareInstall({ clientId: "client-1", requestingClientName: "Test Client", code });

      expect(ref.status).toBe("awaiting_user");
      expect(ref.kind).toBe("install");
      expect(mutator.installScript).not.toHaveBeenCalled();
      // 弹窗与创建解耦：由 present() 负责，prepareInstall 本身不打开确认页。
      expect(vi.mocked(utilsModule.openInCurrentTab)).not.toHaveBeenCalled();

      const op = await operationDAO.get(ref.operationId);
      expect(op?.contentHash).toBe(sha256OfText(code));
      expect(op?.requestedEnabledState).toBe(false);
    });

    it("传入 requestId 时记录到操作上（阻塞响应寻址用）", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("Req"),
        requestId: "req-abc",
      });
      const op = await operationDAO.get(ref.operationId);
      expect(op?.requestId).toBe("req-abc");
    });

    it("url 与 code 同时提供或都不提供时拒绝", async () => {
      await expect(
        service.prepareInstall({ clientId: "client-1", requestingClientName: "c", url: "https://a", code: "x" })
      ).rejects.toThrow(McpBridgeError);
      await expect(service.prepareInstall({ clientId: "client-1", requestingClientName: "c" })).rejects.toThrow(
        McpBridgeError
      );
    });

    it("内联 code 超过 512 KiB 时在暂存前拒绝", async () => {
      const big = "x".repeat(INLINE_CODE_MAX_BYTES + 1);
      await expect(
        service.prepareInstall({ clientId: "client-1", requestingClientName: "c", code: big })
      ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
      expect(mutator.installScript).not.toHaveBeenCalled();
    });

    it("URL 违反策略（私网/本地）时在抓取前拒绝", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        service.prepareInstall({ clientId: "client-1", requestingClientName: "c", url: "https://127.0.0.1/x.user.js" })
      ).rejects.toThrow(McpBridgeError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("URL 通过初步校验并成功抓取后正常暂存，sourceUrl 记录为该 URL", async () => {
      const code = validCode("FromUrl");
      const fetchMock = vi.fn().mockResolvedValue(makeResponse({ url: "https://example.com/x.user.js", body: code }));
      vi.stubGlobal("fetch", fetchMock);
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        url: "https://example.com/x.user.js",
      });
      expect(ref.status).toBe("awaiting_user");
      expect(fetchMock).toHaveBeenCalled();
    });

    it("抓取阶段违反 URL 策略（如重定向到私网主机）时返回 INVALID_REQUEST，而非未处理异常", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(makeResponse({ url: "https://127.0.0.1/redirected.user.js", body: "malicious" }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        service.prepareInstall({
          clientId: "client-1",
          requestingClientName: "c",
          url: "https://example.com/x.user.js",
        })
      ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      expect(mutator.installScript).not.toHaveBeenCalled();
    });

    it("抓取阶段下载超过 2 MiB 时返回 PAYLOAD_TOO_LARGE", async () => {
      const big = "x".repeat(3 * 1024 * 1024);
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          makeResponse({ url: "https://example.com/x.user.js", body: big, contentLength: String(big.length) })
        );
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        service.prepareInstall({
          clientId: "client-1",
          requestingClientName: "c",
          url: "https://example.com/x.user.js",
        })
      ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    });

    it("抓取阶段发生非 URL 策略类错误（如网络失败）时原样向上抛出，而非误包装为 URL 策略拒绝", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError("network failure"));
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        service.prepareInstall({
          clientId: "client-1",
          requestingClientName: "c",
          url: "https://example.com/x.user.js",
        })
      ).rejects.toThrow("network failure");
    });

    it("重复请求（同 clientId + contentHash）返回同一个 operationId，不重复建操作", async () => {
      const code = validCode("Dup");
      const ref1 = await service.prepareInstall({ clientId: "client-1", requestingClientName: "c", code });
      const ref2 = await service.prepareInstall({ clientId: "client-1", requestingClientName: "c", code });
      expect(ref2.operationId).toBe(ref1.operationId);
    });
  });

  describe("decide - 批准前不产生任何写入", () => {
    it("拒绝(approved=false)不调用 installScript，状态变为 rejected", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("R"),
      });
      const result = await service.decide(ref.operationId, false);
      expect(result.status).toBe("rejected");
      expect(mutator.installScript).not.toHaveBeenCalled();
    });

    it("批准后调用 installScript，且新脚本默认禁用", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("E"),
      });
      const result = await service.decide(ref.operationId, true);
      expect(result.status).toBe("approved");
      expect(mutator.installScript).toHaveBeenCalledTimes(1);
      const installedScript = mutator.installScript.mock.calls[0][0].script;
      expect(installedScript.status).toBe(SCRIPT_STATUS_DISABLE);
    });

    it("批准时显式 enable=true 才会启用新脚本", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("F"),
      });
      await service.decide(ref.operationId, true, { enable: true });
      const installedScript = mutator.installScript.mock.calls[0][0].script;
      expect(installedScript.status).toBe(SCRIPT_STATUS_ENABLE);
    });

    it("已过期的操作不能被批准（OPERATION_EXPIRED），且不调用 installScript", async () => {
      vi.useFakeTimers();
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("G"),
      });
      vi.advanceTimersByTime(6 * 60_000);
      await expect(service.decide(ref.operationId, true)).rejects.toMatchObject({ code: "OPERATION_EXPIRED" });
      expect(mutator.installScript).not.toHaveBeenCalled();
    });

    it("已拒绝的操作不能被重放批准", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("H"),
      });
      await service.decide(ref.operationId, false);
      await expect(service.decide(ref.operationId, true)).rejects.toThrow(McpBridgeError);
      expect(mutator.installScript).not.toHaveBeenCalled();
    });

    it("暂存代码在批准前被篡改时返回 CONFLICT，不安装", async () => {
      const code = validCode("Tamper");
      const ref = await service.prepareInstall({ clientId: "client-1", requestingClientName: "c", code });
      const op = await operationDAO.get(ref.operationId);
      const entry = await tempStorageDAO.get(op!.stagedUuid!);
      expect(entry).toBeDefined();
      // Corrupt the recorded contentHash to simulate staged-code drift without touching OPFS directly.
      await operationDAO.update(ref.operationId, { contentHash: "tampered-hash" });
      await expect(service.decide(ref.operationId, true)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mutator.installScript).not.toHaveBeenCalled();
    });

    it("客户端已被撤销时拒绝批准", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("I"),
      });
      await clientDAO.save(makeClient({ revoked: true }));
      await expect(service.decide(ref.operationId, true)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(mutator.installScript).not.toHaveBeenCalled();
    });
  });

  describe("decide - 阻塞响应回发（事件驱动，非 SW 悬挂 Promise）", () => {
    it("带 requestId 的操作批准后经 responder 回发 ok:true 的 bridge.response", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("Wire"),
        requestId: "req-wire",
      });
      await service.decide(ref.operationId, true);
      expect(responder).toHaveBeenCalledTimes(1);
      expect(responder).toHaveBeenCalledWith("req-wire", expect.objectContaining({ requestId: "req-wire", ok: true }));
    });

    it("带 requestId 的操作被拒绝后经 responder 回发 USER_REJECTED", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("WireRej"),
        requestId: "req-rej",
      });
      await service.decide(ref.operationId, false);
      expect(responder).toHaveBeenCalledWith(
        "req-rej",
        expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "USER_REJECTED" }) })
      );
    });

    it("不带 requestId 的操作（直接允许立即执行）批准时不经 responder 回发（同步返回结果）", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("NoWire"),
      });
      const result = await service.decide(ref.operationId, true);
      expect(result.status).toBe("approved");
      expect(responder).not.toHaveBeenCalled();
    });

    it("批准执行失败（CONFLICT）时也经 responder 回发错误响应", async () => {
      const code = validCode("WireFail");
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code,
        requestId: "req-fail",
      });
      await operationDAO.update(ref.operationId, { contentHash: "tampered" });
      await expect(service.decide(ref.operationId, true)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(responder).toHaveBeenCalledWith(
        "req-fail",
        expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "CONFLICT" }) })
      );
    });
  });

  describe("requestToggle / requestDelete - 现有脚本的写请求", () => {
    async function seedScript(uuid: string, code: string) {
      await scriptDAO.save({
        uuid,
        name: "Existing",
        author: "",
        namespace: "ns",
        originDomain: "",
        origin: "",
        checkUpdate: true,
        checkUpdateUrl: "",
        downloadUrl: "",
        config: undefined,
        metadata: { name: ["Existing"], namespace: ["ns"], version: ["1.0.0"] } as any,
        selfMetadata: {},
        sort: -1,
        type: SCRIPT_TYPE_NORMAL,
        status: SCRIPT_STATUS_DISABLE,
        runStatus: "complete",
        createtime: Date.now(),
        updatetime: Date.now(),
        checktime: Date.now(),
      } as any);
      await scriptCodeDAO.save({ uuid, code });
    }

    it("requestToggle 记录 existingCodeHash 并创建 awaiting_user 操作", async () => {
      await seedScript("script-1", "console.log(1)");
      const ref = await service.requestToggle({ clientId: "client-1", uuid: "script-1", enable: true });
      expect(ref.status).toBe("awaiting_user");
      const op = await operationDAO.get(ref.operationId);
      expect(op?.existingCodeHash).toBe(sha256OfText("console.log(1)"));
      expect(mutator.enableScript).not.toHaveBeenCalled();
    });

    it("批准 toggle 后调用 enableScript", async () => {
      await seedScript("script-2", "console.log(2)");
      const ref = await service.requestToggle({ clientId: "client-1", uuid: "script-2", enable: true });
      await service.decide(ref.operationId, true);
      expect(mutator.enableScript).toHaveBeenCalledWith({ uuid: "script-2", enable: true });
    });

    it("目标脚本代码在请求后被修改时批准返回 CONFLICT", async () => {
      await seedScript("script-3", "console.log(3)");
      const ref = await service.requestToggle({ clientId: "client-1", uuid: "script-3", enable: false });
      await scriptCodeDAO.save({ uuid: "script-3", code: "console.log('changed')" });
      await expect(service.decide(ref.operationId, true)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mutator.enableScript).not.toHaveBeenCalled();
    });

    it("对不存在的脚本请求 toggle 返回 NOT_FOUND", async () => {
      await expect(
        service.requestToggle({ clientId: "client-1", uuid: "missing", enable: true })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("目标脚本在请求后被整个删除时批准返回 CONFLICT（而非把 undefined 当作哈希匹配）", async () => {
      await seedScript("script-3b", "console.log(1)");
      const ref = await service.requestToggle({ clientId: "client-1", uuid: "script-3b", enable: false });
      await scriptDAO.delete("script-3b");
      await expect(service.decide(ref.operationId, true)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mutator.enableScript).not.toHaveBeenCalled();
    });

    it("批准 delete 后调用 deleteScript", async () => {
      await seedScript("script-4", "console.log(4)");
      const ref = await service.requestDelete({ clientId: "client-1", uuid: "script-4" });
      await service.decide(ref.operationId, true);
      expect(mutator.deleteScript).toHaveBeenCalledWith("script-4", "mcp");
    });
  });

  describe("决策与 UI 读取 - 不存在的 operationId 处理", () => {
    it("decide 对不存在的 operationId 返回 NOT_FOUND", async () => {
      await expect(service.decide("nonexistent-op", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("getOperationForUI 对不存在的 operationId 返回 undefined", async () => {
      await expect(service.getOperationForUI("nonexistent-op")).resolves.toBeUndefined();
    });

    it("暂存条目在批准前过期/丢失（TempStorageDAO 已清除）时批准返回 CONFLICT", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("N"),
      });
      await tempStorageDAO.delete((await operationDAO.get(ref.operationId))!.stagedUuid!);
      await expect(service.decide(ref.operationId, true)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mutator.installScript).not.toHaveBeenCalled();
    });

    it("批准一个类型不受支持的操作（如遗留/未实现的 kind）返回 INTERNAL_ERROR，而非静默成功", async () => {
      const client = makeClient();
      await clientDAO.save(client);
      await operationDAO.save({
        operationId: "fixture-op",
        clientId: client.clientId,
        kind: "update",
        status: "awaiting_user",
        createdAt: Date.now(),
        expiresAt: Date.now() + 5 * 60_000,
        requestedEnabledState: false,
      } as any);
      await expect(service.decide("fixture-op", true)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    });
  });

  describe("present / reopen - 确认页展示与误关重开", () => {
    it("present 打开对应确认页；install 走 install.html，其余走 mcp_confirm.html", async () => {
      const install = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("P"),
      });
      await service.present(install.operationId);
      expect(vi.mocked(utilsModule.openInCurrentTab)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(utilsModule.openInCurrentTab).mock.calls[0][0]).toContain("/src/install.html?uuid=");
    });

    it("串行展示：已有确认页在等待决策时，第二个操作的 present 不再打开新确认页（排队）", async () => {
      const a = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("A"),
        requestId: "ra",
      });
      const b = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("B"),
        requestId: "rb",
      });
      await service.present(a.operationId);
      await service.present(b.operationId);
      expect(vi.mocked(utilsModule.openInCurrentTab)).toHaveBeenCalledTimes(1);
    });

    it("当前确认页决出后，presentNext 自动弹出下一个排队操作", async () => {
      const a = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("A2"),
        requestId: "ra2",
      });
      const b = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("B2"),
        requestId: "rb2",
      });
      await service.present(a.operationId);
      await service.present(b.operationId); // 排队
      await service.decide(a.operationId, true); // a 决出 → 自动弹 b
      expect(vi.mocked(utilsModule.openInCurrentTab)).toHaveBeenCalledTimes(2);
    });

    it("reopen 对仍待决的操作重新打开确认页（误关 ≠ 拒绝）", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("Re"),
      });
      await service.reopen(ref.operationId);
      expect(vi.mocked(utilsModule.openInCurrentTab)).toHaveBeenCalledTimes(1);
    });

    it("reopen 对已决出/过期的操作抛出 OPERATION_EXPIRED", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("Re2"),
      });
      await service.decide(ref.operationId, false);
      await expect(service.reopen(ref.operationId)).rejects.toMatchObject({ code: "OPERATION_EXPIRED" });
    });

    it("listPending 返回全部待决操作（含请求方名），已决出的不在其中，按创建时间排序", async () => {
      const a = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("LP1"),
      });
      const b = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("LP2"),
      });
      await service.decide(a.operationId, false); // a 决出 → 不再 pending

      const pending = await service.listPending();
      expect(pending.map((p) => p.operationId)).toEqual([b.operationId]);
      expect(pending[0]).toMatchObject({ kind: "install", requestingClientName: "Test Client" });
    });

    it("listPending 过滤掉 TTL 已过期的操作", async () => {
      vi.useFakeTimers();
      await service.prepareInstall({ clientId: "client-1", requestingClientName: "c", code: validCode("LPExp") });
      vi.advanceTimersByTime(6 * 60_000);
      expect(await service.listPending()).toHaveLength(0);
    });
  });

  describe("cancelByRequestId - 断开即作废与决策仲裁（先到先得）", () => {
    it("作废仍待决的操作：状态转为 cancelled，且不回发任何 bridge.response", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("Cancel"),
        requestId: "req-cancel",
      });
      await service.cancelByRequestId("req-cancel");
      const op = await operationDAO.get(ref.operationId);
      expect(op?.status).toBe("cancelled");
      expect(responder).not.toHaveBeenCalled();
    });

    it("作废未知 requestId 时静默无操作", async () => {
      await expect(service.cancelByRequestId("no-such-req")).resolves.toBeUndefined();
    });

    it("cancel 先到 → 随后的 decide 抛 OPERATION_EXPIRED，不执行安装、不回发批准响应", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("CancelFirst"),
        requestId: "req-cf",
      });
      await service.cancelByRequestId("req-cf");
      await expect(service.decide(ref.operationId, true)).rejects.toMatchObject({ code: "OPERATION_EXPIRED" });
      expect(mutator.installScript).not.toHaveBeenCalled();
      expect(responder).not.toHaveBeenCalled();
    });

    it("decide 先到 → 随后的 cancel 是 no-op，不回滚已批准状态", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("DecideFirst"),
        requestId: "req-df",
      });
      await service.decide(ref.operationId, true);
      await service.cancelByRequestId("req-df");
      const op = await operationDAO.get(ref.operationId);
      expect(op?.status).toBe("approved");
      expect(mutator.installScript).toHaveBeenCalledTimes(1);
      expect(responder).toHaveBeenCalledTimes(1);
      expect(responder).toHaveBeenCalledWith("req-df", expect.objectContaining({ ok: true }));
    });
  });

  describe("checkSourceDisclosure - 首次读取源码阻塞、断开即作废", () => {
    async function seedScript(uuid: string, code = "console.log('secret')") {
      await scriptDAO.save({
        uuid,
        name: "Disclosure Target",
        author: "",
        namespace: "ns",
        originDomain: "",
        origin: "",
        checkUpdate: true,
        checkUpdateUrl: "",
        downloadUrl: "",
        config: undefined,
        metadata: { name: ["Disclosure Target"], namespace: ["ns"], version: ["1.0.0"] } as any,
        selfMetadata: {},
        sort: -1,
        type: SCRIPT_TYPE_NORMAL,
        status: SCRIPT_STATUS_ENABLE,
        runStatus: "complete",
        createtime: Date.now(),
        updatetime: Date.now(),
        checktime: Date.now(),
      } as any);
      await scriptCodeDAO.save({ uuid, code });
    }

    it("对不存在的脚本返回 NOT_FOUND，不创建任何待批操作", async () => {
      await expect(
        service.checkSourceDisclosure({ clientId: "client-1", uuid: "missing", requestingClientName: "c" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await operationDAO.byClient("client-1")).toHaveLength(0);
    });

    it("首次读取创建 awaiting_user 的 source_disclosure 待批操作，而非直接放行", async () => {
      await seedScript("script-x");
      const result = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-x",
        requestingClientName: "c",
      });
      expect(result).not.toBe("allowed");
      if (result !== "allowed") {
        expect(result.status).toBe("awaiting_user");
        expect(result.kind).toBe("source_disclosure");
      }
    });

    it("同一 (client, uuid) 重复请求且仍 awaiting_user 时返回同一个 operationId", async () => {
      await seedScript("script-y");
      const first = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-y",
        requestingClientName: "c",
      });
      const second = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-y",
        requestingClientName: "c",
      });
      expect(first === "allowed" ? undefined : first.operationId).toBe(
        second === "allowed" ? undefined : second.operationId
      );
    });

    it("批准披露（阻塞语义）即经 responder 回发脚本源码，无需二次调用", async () => {
      await seedScript("script-src", "console.log('the-secret-source')");
      const pending = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-src",
        requestingClientName: "c",
        requestId: "req-src",
      });
      const operationId = pending === "allowed" ? "" : pending.operationId;
      await service.decide(operationId, true, { rememberChoice: "once" });
      expect(responder).toHaveBeenCalledWith(
        "req-src",
        expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            code: "console.log('the-secret-source')",
            contentTrust: "untrusted-user-script-source",
          }),
        })
      );
    });

    it("remember=once：批准并读取一次后，再次读取需要重新批准（不留可复用的已批准记录）", async () => {
      await seedScript("script-z");
      const pending = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-z",
        requestingClientName: "c",
      });
      const operationId = pending === "allowed" ? "" : pending.operationId;
      await service.decide(operationId, true, { rememberChoice: "once" });

      const secondRead = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-z",
        requestingClientName: "c",
      });
      expect(secondRead).not.toBe("allowed");
    });

    it("remember=client：批准后写入客户端白名单，后续任意次读取都直接放行且不再创建操作", async () => {
      await seedScript("script-w");
      const pending = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-w",
        requestingClientName: "c",
      });
      const operationId = pending === "allowed" ? "" : pending.operationId;
      await service.decide(operationId, true, { rememberChoice: "client" });

      expect(await clientDAO.get("client-1")).toMatchObject({ sourceDisclosureAllowed: ["script-w"] });

      const first = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-w",
        requestingClientName: "c",
      });
      const second = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-w",
        requestingClientName: "c",
      });
      expect(first).toBe("allowed");
      expect(second).toBe("allowed");
    });

    it("拒绝披露后不放行，且该操作不能被重放批准", async () => {
      await seedScript("script-v");
      const pending = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-v",
        requestingClientName: "c",
      });
      const operationId = pending === "allowed" ? "" : pending.operationId;
      await service.decide(operationId, false);

      const afterReject = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-v",
        requestingClientName: "c",
      });
      expect(afterReject).not.toBe("allowed");
      await expect(service.decide(operationId, true)).rejects.toThrow(McpBridgeError);
    });

    it("断开即作废：source_disclosure 待批操作可经 cancelByRequestId 作废", async () => {
      await seedScript("script-cancel");
      const pending = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-cancel",
        requestingClientName: "c",
        requestId: "req-src-cancel",
      });
      const operationId = pending === "allowed" ? "" : pending.operationId;
      await service.cancelByRequestId("req-src-cancel");
      const op = await operationDAO.get(operationId);
      expect(op?.status).toBe("cancelled");
    });
  });
});
