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
  });
});
