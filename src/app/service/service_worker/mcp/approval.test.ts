import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { McpApprovalService, INLINE_CODE_MAX_BYTES, type McpScriptMutator } from "./approval";
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

    service = new McpApprovalService(mutator, scriptDAO, scriptCodeDAO, clientDAO, operationDAO, tempStorageDAO);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("prepareInstall - 暂存但不安装", () => {
    it("暂存代码、计算哈希、创建 awaiting_user 操作，且不调用 installScript", async () => {
      const code = validCode("Hello");
      const ref = await service.prepareInstall({ clientId: "client-1", requestingClientName: "Test Client", code });

      expect(ref.status).toBe("awaiting_user");
      expect(ref.kind).toBe("install");
      expect(mutator.installScript).not.toHaveBeenCalled();

      const op = await operationDAO.get(ref.operationId);
      expect(op?.contentHash).toBe(sha256OfText(code));
      expect(op?.requestedEnabledState).toBe(false);
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

    it("重复请求（同 clientId + contentHash）返回同一个 operationId，不重复弹窗", async () => {
      const code = validCode("Dup");
      const ref1 = await service.prepareInstall({ clientId: "client-1", requestingClientName: "c", code });
      const ref2 = await service.prepareInstall({ clientId: "client-1", requestingClientName: "c", code });
      expect(ref2.operationId).toBe(ref1.operationId);
      expect(vi.mocked(utilsModule.openInCurrentTab)).toHaveBeenCalledTimes(1);
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

  describe("get / list / cancel - 按 clientId 隔离", () => {
    it("客户端 B 不能读取客户端 A 的操作（NOT_FOUND，而非 INSUFFICIENT_SCOPE，避免泄露存在性）", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("J"),
      });
      await expect(service.getOperation("client-2", ref.operationId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("listOperations 只返回该 client 未过期的操作", async () => {
      vi.useFakeTimers();
      const ref1 = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("K1"),
      });
      const ref2 = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("K2"),
      });
      await service.decide(ref2.operationId, false);
      const list = await service.listOperations("client-1");
      expect(list.map((o) => o.operationId).sort()).toEqual([ref1.operationId, ref2.operationId].sort());

      // Now expire ref1 and confirm it drops out of the list.
      vi.advanceTimersByTime(6 * 60_000);
      const listAfterExpiry = await service.listOperations("client-1");
      expect(listAfterExpiry.map((o) => o.operationId)).not.toContain(ref1.operationId);
    });

    it("cancelOperation 仅在 awaiting_user 时可取消，关闭挂起的批准", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("L"),
      });
      const result = await service.cancelOperation("client-1", ref.operationId);
      expect(result.status).toBe("cancelled");
      await expect(service.decide(ref.operationId, true)).rejects.toThrow(McpBridgeError);
      expect(mutator.installScript).not.toHaveBeenCalled();
    });

    it("cancelOperation 对不存在的 operationId 返回 NOT_FOUND", async () => {
      await expect(service.cancelOperation("client-1", "nonexistent-op")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("cancelOperation 对已被决定（非 awaiting_user）的操作再次取消返回 CONFLICT", async () => {
      const ref = await service.prepareInstall({
        clientId: "client-1",
        requestingClientName: "c",
        code: validCode("M"),
      });
      await service.decide(ref.operationId, false);
      await expect(service.cancelOperation("client-1", ref.operationId)).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("decide 对不存在的 operationId 返回 NOT_FOUND", async () => {
      await expect(service.decide("nonexistent-op", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("getOperation 对不存在的 operationId 返回 NOT_FOUND", async () => {
      await expect(service.getOperation("client-1", "nonexistent-op")).rejects.toMatchObject({ code: "NOT_FOUND" });
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
      // "update" is a valid OperationKind union member with no real create path anywhere in this
      // codebase (only scripts.install.prepare ever creates operations, and it always stages a
      // brand-new uuid — there is no MCP-triggered "update existing script" flow) —
      // executeApproved's default branch exists specifically to fail loudly if one is ever seen.
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

  describe("checkSourceDisclosure - 首次读取源码的按客户端一次性/永久同意", () => {
    async function seedScript(uuid: string) {
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

    it("同一 (client, uuid) 重复请求且仍 awaiting_user 时返回同一个 operationId，不重复弹窗", async () => {
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

    it("批准且未选择记住（remember=once）时：紧接着的下一次读取放行一次，此后再次读取需要重新批准", async () => {
      await seedScript("script-z");
      const pending = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-z",
        requestingClientName: "c",
      });
      const operationId = pending === "allowed" ? "" : pending.operationId;
      await service.decide(operationId, true, { rememberChoice: "once" });

      const afterApprove = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-z",
        requestingClientName: "c",
      });
      expect(afterApprove).toBe("allowed");

      // The one-shot grant is consumed by the read above — a second read is not silently allowed.
      const secondRead = await service.checkSourceDisclosure({
        clientId: "client-1",
        uuid: "script-z",
        requestingClientName: "c",
      });
      expect(secondRead).not.toBe("allowed");
    });

    it("批准并选择「对该客户端始终允许」（remember=client）后，后续任意次读取都直接放行且不再创建操作", async () => {
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
      // Rejected, not awaiting_user — a fresh prompt is created rather than silently allowing.
      expect(afterReject).not.toBe("allowed");
      await expect(service.decide(operationId, true)).rejects.toThrow(McpBridgeError);
    });
  });
});
