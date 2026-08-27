import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExternalAccessBridge, type ExternalAccessWriteNotice } from "./bridge";
import { ExternalAccessApprovalService, type ExternalAccessScriptMutator } from "./approval";
import { ExternalAccessOperationDAO } from "@App/app/repo/external_access";
import { ScriptDAO, ScriptCodeDAO, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { TempStorageDAO } from "@App/app/repo/tempStorage";
import { type BridgeAction, type ExternalAccessBridgeRequest, type ExternalAccessBridgeResponse } from "./types";
import type { ExternalAccessWritePolicy, ExternalAccessSourceReadPolicy } from "@App/pkg/config/config";
import type { ExternalAccessAuditEvent } from "./audit";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { sha256OfText } from "@App/pkg/utils/crypto";
import { createMockOPFS } from "@App/app/repo/test-helpers";
import * as utilsModule from "@App/pkg/utils/utils";

const VALID_SCRIPT_CODE = `// ==UserScript==
// @name Bridge Install Target
// @namespace test-ns
// @version 1.0.0
// ==/UserScript==
console.log("hi");`;

const SRC_UUID = "11111111-1111-4111-8111-111111111111";

function expectResponse(r: ExternalAccessBridgeResponse | null): ExternalAccessBridgeResponse {
  expect(r).not.toBeNull();
  return r as ExternalAccessBridgeResponse;
}

function makeRequest(
  action: BridgeAction,
  input: unknown,
  overrides: Partial<ExternalAccessBridgeRequest> = {}
): ExternalAccessBridgeRequest {
  return { requestId: uuidv4(), clientId: "session-1", action, input, ...overrides };
}

describe("ExternalAccessBridge（扁平信任 + 双策略）", () => {
  let bridge: ExternalAccessBridge;
  let scriptDAO: ScriptDAO;
  let scriptCodeDAO: ScriptCodeDAO;
  let operationDAO: ExternalAccessOperationDAO;
  let approval: ExternalAccessApprovalService;
  let writePolicy: ExternalAccessWritePolicy;
  let sourcePolicy: ExternalAccessSourceReadPolicy;
  let notifyWrite: ReturnType<typeof vi.fn>;
  let audit: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    chrome.storage.local.clear();
    await chrome.storage.session.clear();
    createMockOPFS();
    vi.spyOn(utilsModule, "openInCurrentTab").mockResolvedValue(undefined);
    writePolicy = "approval";
    sourcePolicy = "approval";
    notifyWrite = vi.fn();
    audit = vi.fn();
    scriptDAO = new ScriptDAO();
    scriptCodeDAO = new ScriptCodeDAO();
    operationDAO = new ExternalAccessOperationDAO();
    const mutator: ExternalAccessScriptMutator = {
      installScript: vi.fn().mockResolvedValue({ update: false, updatetime: Date.now() }),
      enableScript: vi.fn().mockResolvedValue(undefined),
      deleteScript: vi.fn().mockResolvedValue(undefined),
    };
    approval = new ExternalAccessApprovalService(mutator, scriptDAO, scriptCodeDAO, operationDAO, new TempStorageDAO());
    bridge = new ExternalAccessBridge(
      scriptDAO,
      scriptCodeDAO,
      approval,
      async () => writePolicy,
      async () => sourcePolicy,
      notifyWrite as (n: ExternalAccessWriteNotice) => void,
      audit as (e: ExternalAccessAuditEvent) => void
    );
  });

  afterEach(() => vi.restoreAllMocks());

  async function seedScript(uuid: string, overrides: Record<string, unknown> = {}) {
    await scriptDAO.save({
      uuid,
      name: "Existing Script",
      author: "author",
      namespace: "ns",
      originDomain: "",
      origin: "",
      checkUpdate: true,
      checkUpdateUrl: "https://example.com/x.meta.js?token=secret",
      downloadUrl: "https://example.com/x.user.js",
      config: undefined,
      metadata: { name: ["Existing Script"], namespace: ["ns"], version: ["1.0.0"], match: ["*://*/*"] } as any,
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
    await scriptCodeDAO.save({ uuid, code: "console.log('secret-source')" });
  }

  it("input 含未知字段返回 INVALID_REQUEST 并记一条 denied 审计", async () => {
    const response = expectResponse(await bridge.handle(makeRequest("scripts.list", { unexpected: true })));
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("INVALID_REQUEST");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ decision: "denied", client: "session-1" }));
  });

  it("uuid 格式非法返回 INVALID_REQUEST", async () => {
    const response = expectResponse(await bridge.handle(makeRequest("scripts.metadata.get", { uuid: "not-a-uuid" })));
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("INVALID_REQUEST");
  });

  it("scripts.list 不含 code / 完整 updateUrl，携带 contentTrust", async () => {
    await seedScript("script-1");
    const response = expectResponse(await bridge.handle(makeRequest("scripts.list", {})));
    expect(response.ok).toBe(true);
    if (response.ok) {
      const result = response.result as { scripts: any[]; contentTrust: string };
      expect(result.contentTrust).toBe("untrusted-user-script-metadata");
      expect(result.scripts[0]).not.toHaveProperty("code");
      expect(result.scripts[0]).not.toHaveProperty("checkUpdateUrl");
      expect(result.scripts[0].hasUpdateUrl).toBe(true);
    }
  });

  it("scripts.metadata.get 未找到脚本返回 NOT_FOUND", async () => {
    const response = expectResponse(
      await bridge.handle(makeRequest("scripts.metadata.get", { uuid: "00000000-0000-4000-8000-000000000000" }))
    );
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe("NOT_FOUND");
  });

  it("scripts.metadata.get 原样返回脚本 metadata URL", async () => {
    await seedScript(SRC_UUID, {
      metadata: {
        name: ["Existing Script"],
        match: ["https://user:pass@example.com/path?token=secret#fragment"],
        require: ["https://cdn.example.com/lib.js?sig=secret"],
        resource: ["icon https://assets.example.com/icon.png?key=secret"],
      },
    });
    const response = expectResponse(await bridge.handle(makeRequest("scripts.metadata.get", { uuid: SRC_UUID })));
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.result).toMatchObject({
        matches: ["https://user:pass@example.com/path?token=secret#fragment"],
        requires: ["https://cdn.example.com/lib.js?sig=secret"],
        resources: ["icon https://assets.example.com/icon.png?key=secret"],
      });
    }
  });

  describe("scripts.source.get 按源码读取策略分流（CLI 不再豁免）", () => {
    it("源码策略=直接允许时立即返回源码，无需确认", async () => {
      sourcePolicy = "allow";
      await seedScript(SRC_UUID);
      const response = expectResponse(await bridge.handle(makeRequest("scripts.source.get", { uuid: SRC_UUID })));
      expect(response.ok).toBe(true);
      if (response.ok) expect((response.result as { code: string }).code).toContain("secret-source");
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ decision: "allowed" }));
    });

    it("全文读取在调用方预算边界成功，超过时拒绝并引导改用 grep 或行窗", async () => {
      sourcePolicy = "allow";
      await seedScript(SRC_UUID);
      await scriptCodeDAO.save({ uuid: SRC_UUID, code: "0123456789abcdef" } as any);

      const atLimit = expectResponse(
        await bridge.handle(makeRequest("scripts.source.get", { uuid: SRC_UUID, maxBytes: 16 }))
      );
      expect(atLimit.ok).toBe(true);

      const response = expectResponse(
        await bridge.handle(makeRequest("scripts.source.get", { uuid: SRC_UUID, maxBytes: 8 }))
      );

      expect(response.ok).toBe(false);
      if (!response.ok) {
        expect(response.error.code).toBe("PAYLOAD_TOO_LARGE");
        expect(response.error.message).toContain("grep");
        expect(response.error.message).toContain("startLine/endLine");
      }
    });

    it("源码策略=需人工审批时挂起（返回 null）并创建待批操作", async () => {
      sourcePolicy = "approval";
      await seedScript(SRC_UUID);
      const result = await bridge.handle(makeRequest("scripts.source.get", { uuid: SRC_UUID }));
      expect(result).toBeNull();
      const pending = await operationDAO.awaitingUser();
      expect(pending).toHaveLength(1);
      expect(pending[0].kind).toBe("source_disclosure");
      expect(utilsModule.openInCurrentTab).toHaveBeenCalled();
    });

    it("startLine/endLine 开窗读取：直接允许时立即返回切片与行窗字段，sha256 仍是全文哈希", async () => {
      sourcePolicy = "allow";
      await seedScript(SRC_UUID);
      await scriptCodeDAO.save({ uuid: SRC_UUID, code: "l1\nl2\nl3\nl4" } as any);
      const response = expectResponse(
        await bridge.handle(makeRequest("scripts.source.get", { uuid: SRC_UUID, startLine: 2, endLine: 3 }))
      );
      expect(response.ok).toBe(true);
      if (response.ok) {
        const result = response.result as {
          code: string;
          sha256: string;
          startLine: number;
          endLine: number;
          totalLines: number;
        };
        expect(result.code).toBe("l2\nl3");
        expect(result.startLine).toBe(2);
        expect(result.endLine).toBe(3);
        expect(result.totalLines).toBe(4);
        expect(result.sha256).toBe(sha256OfText("l1\nl2\nl3\nl4"));
        expect(result.sha256).not.toBe(sha256OfText("l2\nl3"));
      }
    });

    it("startLine 越界（超出总行数）时返回 INVALID_REQUEST", async () => {
      sourcePolicy = "allow";
      await seedScript(SRC_UUID);
      await scriptCodeDAO.save({ uuid: SRC_UUID, code: "l1\nl2" } as any);
      const response = expectResponse(
        await bridge.handle(makeRequest("scripts.source.get", { uuid: SRC_UUID, startLine: 10, endLine: 12 }))
      );
      expect(response.ok).toBe(false);
      if (!response.ok) expect(response.error.code).toBe("INVALID_REQUEST");
    });
  });

  describe("scripts.source.grep 复用整份读取的披露闸门（同 scope、同会话允许 key）", () => {
    it("源码策略=直接允许时立即返回命中行，无需确认", async () => {
      sourcePolicy = "allow";
      await seedScript(SRC_UUID);
      await scriptCodeDAO.save({ uuid: SRC_UUID, code: "alpha\nsecret line\nomega" } as any);
      const response = expectResponse(
        await bridge.handle(makeRequest("scripts.source.grep", { uuid: SRC_UUID, query: "secret" }))
      );
      expect(response.ok).toBe(true);
      if (response.ok) {
        const result = response.result as { matches: Array<{ lineNumber: number }> };
        expect(result.matches).toEqual([expect.objectContaining({ lineNumber: 2 })]);
      }
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ decision: "allowed" }));
    });

    it("源码策略=需人工审批时挂起并创建 kind=source_disclosure 的待批操作", async () => {
      sourcePolicy = "approval";
      await seedScript(SRC_UUID);
      const result = await bridge.handle(makeRequest("scripts.source.grep", { uuid: SRC_UUID, query: "secret" }));
      expect(result).toBeNull();
      const pending = await operationDAO.awaitingUser();
      expect(pending).toHaveLength(1);
      expect(pending[0].kind).toBe("source_disclosure");
      expect(utilsModule.openInCurrentTab).toHaveBeenCalled();
    });

    it("非法正则模式返回 INVALID_REQUEST", async () => {
      sourcePolicy = "allow";
      await seedScript(SRC_UUID);
      const response = expectResponse(
        await bridge.handle(
          makeRequest("scripts.source.grep", { uuid: SRC_UUID, query: "(unterminated", mode: "regex" })
        )
      );
      expect(response.ok).toBe(false);
      if (!response.ok) expect(response.error.code).toBe("INVALID_REQUEST");
    });

    it("参数越界/非法时在受理阶段就报 INVALID_REQUEST：不创建待批操作、不为注定失败的请求弹确认页", async () => {
      sourcePolicy = "approval";
      await seedScript(SRC_UUID);
      const invalid: Array<[BridgeAction, Record<string, unknown>]> = [
        ["scripts.source.grep", { uuid: SRC_UUID, query: "(unterminated", mode: "regex" }],
        ["scripts.source.grep", { uuid: SRC_UUID, query: "" }],
        ["scripts.source.grep", { uuid: SRC_UUID, query: "x", contextLines: 11 }],
        ["scripts.source.grep", { uuid: SRC_UUID, query: "x", maxMatches: 201 }],
        ["scripts.source.get", { uuid: SRC_UUID, startLine: 0, endLine: 3 }],
        ["scripts.source.get", { uuid: SRC_UUID, startLine: 3, endLine: 1 }],
        ["scripts.source.get", { uuid: SRC_UUID, startLine: 1 }],
      ];
      for (const [action, input] of invalid) {
        const response = expectResponse(await bridge.handle(makeRequest(action, input)));
        expect(response.ok, `${action} ${JSON.stringify(input)}`).toBe(false);
        if (!response.ok) expect(response.error.code).toBe("INVALID_REQUEST");
      }
      expect(await operationDAO.awaitingUser()).toHaveLength(0);
      expect(utilsModule.openInCurrentTab).not.toHaveBeenCalled();
    });

    it("同一脚本上并发的整份读取与 grep 挂起态不合并为一个操作", async () => {
      sourcePolicy = "approval";
      await seedScript(SRC_UUID);
      const getResult = await bridge.handle(makeRequest("scripts.source.get", { uuid: SRC_UUID }));
      const grepResult = await bridge.handle(makeRequest("scripts.source.grep", { uuid: SRC_UUID, query: "secret" }));
      expect(getResult).toBeNull();
      expect(grepResult).toBeNull();
      const pending = await operationDAO.awaitingUser();
      expect(pending).toHaveLength(2);
    });
  });

  describe("写操作按写操作策略分流", () => {
    it("写策略=需人工审批时安装挂起并 stage 代码", async () => {
      writePolicy = "approval";
      const result = await bridge.handle(makeRequest("scripts.install.request", { code: VALID_SCRIPT_CODE }));
      expect(result).toBeNull();
      const pending = await operationDAO.awaitingUser();
      expect(pending).toHaveLength(1);
      expect(pending[0].kind).toBe("install");
    });

    it("写策略=直接允许时安装立即执行且默认启用（即装即用）并发通知", async () => {
      writePolicy = "allow";
      const mutator = (approval as unknown as { mutator: ExternalAccessScriptMutator }).mutator;
      const response = expectResponse(
        await bridge.handle(makeRequest("scripts.install.request", { code: VALID_SCRIPT_CODE }))
      );
      expect(response.ok).toBe(true);
      const installed = (mutator.installScript as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(installed.script.status).toBe(SCRIPT_STATUS_ENABLE);
      expect(notifyWrite).toHaveBeenCalledWith(expect.objectContaining({ kind: "install" }));
    });

    it("写策略=直接允许时启用脚本立即执行", async () => {
      writePolicy = "allow";
      await seedScript(SRC_UUID);
      const mutator = (approval as unknown as { mutator: ExternalAccessScriptMutator }).mutator;
      const response = expectResponse(
        await bridge.handle(makeRequest("scripts.toggle.request", { uuid: SRC_UUID, enable: false }))
      );
      expect(response.ok).toBe(true);
      if (response.ok) expect(response.result).toEqual({ uuid: SRC_UUID, name: "Existing Script", enabled: false });
      expect(mutator.enableScript).toHaveBeenCalledWith({ uuid: SRC_UUID, enable: false });
    });

    it("写策略=直接允许时删除返回协议声明的删除结果", async () => {
      writePolicy = "allow";
      await seedScript(SRC_UUID);
      const response = expectResponse(await bridge.handle(makeRequest("scripts.delete.request", { uuid: SRC_UUID })));
      expect(response.ok).toBe(true);
      if (response.ok) expect(response.result).toEqual({ uuid: SRC_UUID, deleted: true });
    });
  });

  describe("scripts.edit.request 内容锚定编辑", () => {
    // 编辑要走 prepareScriptByCode 重新解析，目标脚本的代码必须带完整元数据块。
    const EDITABLE_CODE = `// ==UserScript==
// @name Existing Script
// @namespace ns
// @version 1.0.0
// ==/UserScript==
console.log('v1');`;
    const EDITED_CODE = EDITABLE_CODE.replace("console.log('v1')", "console.log('v2')");
    const editV1toV2 = [{ oldText: "console.log('v1')", newText: "console.log('v2')" }];

    async function seedEditTarget(overrides: Record<string, unknown> = {}) {
      await seedScript(SRC_UUID, { origin: "https://example.com/x.user.js", ...overrides });
      await scriptCodeDAO.save({ uuid: SRC_UUID, code: EDITABLE_CODE });
    }

    it("写策略=需人工审批时挂起并创建 kind=update 的待批操作，确认页是安装页", async () => {
      writePolicy = "approval";
      await seedEditTarget();
      const result = await bridge.handle(makeRequest("scripts.edit.request", { uuid: SRC_UUID, edits: editV1toV2 }));
      expect(result).toBeNull();
      const pending = await operationDAO.awaitingUser();
      expect(pending).toHaveLength(1);
      expect(pending[0].kind).toBe("update");
      expect(utilsModule.openInCurrentTab).toHaveBeenCalledWith(`/src/install.html?uuid=${SRC_UUID}`);
    });

    it("写策略=直接允许时立即按新全文安装，并保留脚本原有的启用状态", async () => {
      writePolicy = "allow";
      await seedEditTarget({ status: SCRIPT_STATUS_ENABLE });
      const mutator = (approval as unknown as { mutator: ExternalAccessScriptMutator }).mutator;
      const response = expectResponse(
        await bridge.handle(makeRequest("scripts.edit.request", { uuid: SRC_UUID, edits: editV1toV2 }))
      );
      expect(response.ok).toBe(true);
      const installed = (mutator.installScript as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(installed.code).toBe(EDITED_CODE);
      // 「直接允许」不经确认页，没有开关值可传；无条件按 enable 覆盖会把这个已启用的脚本静默关掉。
      expect(installed.script.status).toBe(SCRIPT_STATUS_ENABLE);
      expect(notifyWrite).toHaveBeenCalledWith(expect.objectContaining({ kind: "update" }));
    });

    it("锚点未命中与不唯一返回可区分的 INVALID_REQUEST，且不创建待批操作、不弹确认页", async () => {
      writePolicy = "approval";
      await seedEditTarget();
      const notFound = expectResponse(
        await bridge.handle(
          makeRequest("scripts.edit.request", { uuid: SRC_UUID, edits: [{ oldText: "absent", newText: "x" }] })
        )
      );
      expect(notFound.ok).toBe(false);
      if (!notFound.ok) {
        expect(notFound.error.code).toBe("INVALID_REQUEST");
        expect(notFound.error.message).toContain("not found");
      }
      const notUnique = expectResponse(
        await bridge.handle(
          makeRequest("scripts.edit.request", { uuid: SRC_UUID, edits: [{ oldText: "// ", newText: "//" }] })
        )
      );
      expect(notUnique.ok).toBe(false);
      if (!notUnique.ok) {
        expect(notUnique.error.code).toBe("INVALID_REQUEST");
        expect(notUnique.error.message).toContain("not unique");
      }
      expect(await operationDAO.awaitingUser()).toHaveLength(0);
      expect(utilsModule.openInCurrentTab).not.toHaveBeenCalled();
    });

    it("edits 的结构与字段类型在受理阶段严格校验", async () => {
      writePolicy = "approval";
      await seedEditTarget();
      const invalid: Record<string, unknown>[] = [
        { uuid: SRC_UUID },
        { uuid: SRC_UUID, edits: [] },
        { uuid: SRC_UUID, edits: {} },
        { uuid: SRC_UUID, edits: [{ oldText: 1, newText: "x" }] },
        { uuid: SRC_UUID, edits: [{ oldText: "a" }] },
        { uuid: SRC_UUID, edits: [{ oldText: "a", newText: "b", replaceAll: "yes" }] },
        { uuid: SRC_UUID, edits: [{ oldText: "a", newText: "b", where: 3 }] },
        { uuid: SRC_UUID, edits: editV1toV2, unexpected: true },
      ];
      for (const input of invalid) {
        const response = expectResponse(await bridge.handle(makeRequest("scripts.edit.request", input)));
        expect(response.ok, JSON.stringify(input)).toBe(false);
        if (!response.ok) expect(response.error.code).toBe("INVALID_REQUEST");
      }
      expect(await operationDAO.awaitingUser()).toHaveLength(0);
    });

    it("目标脚本不存在返回 NOT_FOUND", async () => {
      writePolicy = "approval";
      const response = expectResponse(
        await bridge.handle(makeRequest("scripts.edit.request", { uuid: SRC_UUID, edits: editV1toV2 }))
      );
      expect(response.ok).toBe(false);
      if (!response.ok) expect(response.error.code).toBe("NOT_FOUND");
    });
  });

  it("业务输入中夹带的 clientId 字段被严格校验拒绝，审计记的是已认证 clientId", async () => {
    await bridge.handle(
      makeRequest("scripts.list", { clientId: "attacker" } as unknown as Record<string, never>, {
        clientId: "session-1",
      })
    );
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ client: "session-1", decision: "denied" }));
  });
});
