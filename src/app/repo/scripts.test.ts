import { describe, it, expect, beforeEach } from "vitest";
import {
  ScriptDAO,
  ScriptCodeDAO,
  type Script,
  SCRIPT_TYPE_NORMAL,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_RUN_STATUS_COMPLETE,
} from "./scripts";

const baseMeta = {
  name: ["测试脚本"],
  namespace: ["test-namespace"],
  version: ["1.0.0"],
  author: ["测试作者"],
  copyright: ["(c) 测试"],
  grant: ["GM_xmlhttpRequest"],
  match: ["https://example.com/*"],
  license: ["MIT"],
};

const makeBaseScript = (overrides: Partial<Script>): Script => ({
  uuid: "uuid-base",
  name: "测试脚本",
  namespace: "test-namespace",
  author: "测试作者",
  type: SCRIPT_TYPE_NORMAL,
  status: SCRIPT_STATUS_ENABLE,
  sort: 0,
  runStatus: SCRIPT_RUN_STATUS_COMPLETE,
  createtime: Date.now(),
  updatetime: Date.now(),
  checktime: Date.now(),
  origin: "https://example.com/script.user.js",
  metadata: { ...baseMeta },
  ...overrides,
});

describe("ScriptDAO.searchExistingScript", () => {
  let dao: ScriptDAO;

  beforeEach(() => {
    dao = new ScriptDAO();
  });

  it("应能在 scriptcat 场景下匹配到已存在脚本（忽略脚本名差异并校验作者/授权/匹配等信息）", async () => {
    const existing = makeBaseScript({
      uuid: "sc-1",
      origin: "https://scriptcat.org/scripts/code/1234/old-name.js",
    });
    await dao.save(existing);

    const target: Script = makeBaseScript({
      uuid: "target-1",
      origin: "https://scriptcat.org/scripts/code/1234/new-name.js",
      metadata: {
        ...baseMeta,
        // 无 updateurl/downloadurl => 走 scriptcat 分支
      } as any,
    });

    const found = await dao.searchExistingScript(target);
    expect(found[0]?.uuid).toBe("sc-1");
  });

  it("应能在 greasyfork 场景下匹配（忽略文件名差异，基于 id 与 update/download URL）", async () => {
    const existing = makeBaseScript({
      uuid: "gf-1",
      origin: "https://update.greasyfork.org/scripts/1234/old.meta.js",
      metadata: {
        ...baseMeta,
        updateurl: ["https://update.greasyfork.org/scripts/1234/old.meta.js"],
        downloadurl: ["https://update.greasyfork.org/scripts/1234/old.user.js"],
      } as any,
    });
    await dao.save(existing);

    const target: Script = makeBaseScript({
      uuid: "target-2",
      origin: "https://update.greasyfork.org/scripts/1234/new-name.meta.js",
      metadata: {
        ...baseMeta,
        updateurl: ["https://update.greasyfork.org/scripts/1234/new-name.meta.js"],
        downloadurl: ["https://update.greasyfork.org/scripts/1234/new-name.user.js"],
      } as any,
    });

    const found = await dao.searchExistingScript(target);
    expect(found[0]?.uuid).toBe("gf-1");
  });

  it("只有 updateurl 也可以匹配 greasyfork 脚本", async () => {
    const existing = makeBaseScript({
      uuid: "gf-2",
      origin: "https://update.greasyfork.org/scripts/5678/keep.meta.js",
      metadata: {
        ...baseMeta,
        updateurl: ["https://update.greasyfork.org/scripts/5678/keep.meta.js"],
      } as any,
    });
    await dao.save(existing);

    const target: Script = makeBaseScript({
      uuid: "target-3",
      origin: "https://update.greasyfork.org/scripts/5678/changed-name.meta.js",
      metadata: {
        ...baseMeta,
        updateurl: ["https://update.greasyfork.org/scripts/5678/changed-name.meta.js"],
      } as any,
    });

    const found = await dao.searchExistingScript(target);
    expect(found[0]?.uuid).toBe("gf-2");
  });

  it("当元数据关键信息不一致（如 grant）时不应匹配", async () => {
    const existing = makeBaseScript({
      uuid: "mismatch-1",
      origin: "https://scriptcat.org/scripts/code/42/old.js",
    });
    await dao.save(existing);

    const target: Script = makeBaseScript({
      uuid: "target-4",
      origin: "https://scriptcat.org/scripts/code/42/new.js",
      metadata: {
        ...baseMeta,
        grant: ["none"], // 与 existing 不同
      } as any,
    });

    const found = await dao.searchExistingScript(target);
    expect(found[0]).toBeUndefined();
  });

  it("不同域名/来源不应匹配", async () => {
    const existing = makeBaseScript({
      uuid: "domain-1",
      origin: "https://scriptcat.org/scripts/code/999/old.js",
    });
    await dao.save(existing);

    const target: Script = makeBaseScript({
      uuid: "target-5",
      origin: "https://update.greasyfork.org/scripts/999/new.meta.js",
      metadata: {
        ...baseMeta,
        updateurl: ["https://update.greasyfork.org/scripts/999/new.meta.js"],
      } as any,
    });

    const found = await dao.searchExistingScript(target);
    expect(found[0]).toBeUndefined();
  });
});

describe("ScriptCodeDAO", () => {
  let dao: ScriptCodeDAO;

  beforeEach(async () => {
    await chrome.storage.local.clear();
    (globalThis as any).__clearOPFSMock?.();
    dao = new ScriptCodeDAO();
  });

  it("save 后 get 应该从 OPFS 读取", async () => {
    await dao.save({ uuid: "test-1", code: "alert('hello');" });
    const result = await dao.get("test-1");
    expect(result).toBeDefined();
    expect(result!.code).toBe("alert('hello');");
  });

  it("get 不存在的脚本应返回 undefined", async () => {
    const result = await dao.get("nonexistent");
    expect(result).toBeUndefined();
  });

  it("OPFS 不存在时应 fallback 到 chrome.storage.local", async () => {
    await chrome.storage.local.set({ "scriptCode:old-script": { uuid: "old-script", code: "old code" } });
    const result = await dao.get("old-script");
    expect(result).toBeDefined();
    expect(result!.code).toBe("old code");
  });

  it("fallback 读取后应懒迁移到 OPFS", async () => {
    await chrome.storage.local.set({ "scriptCode:lazy": { uuid: "lazy", code: "lazy code" } });
    await dao.get("lazy");
    // 等待懒迁移的异步写入完成
    await new Promise((resolve) => setTimeout(resolve, 0));
    await chrome.storage.local.clear();
    const dao2 = new ScriptCodeDAO();
    const result = await dao2.get("lazy");
    expect(result).toBeDefined();
    expect(result!.code).toBe("lazy code");
  });

  it("delete 应同时删除 OPFS 和 chrome.storage.local", async () => {
    await dao.save({ uuid: "del-test", code: "to delete" });
    await dao.delete("del-test");
    const result = await dao.get("del-test");
    expect(result).toBeUndefined();
  });

  it("gets 应批量获取", async () => {
    await dao.save({ uuid: "a", code: "code-a" });
    await dao.save({ uuid: "b", code: "code-b" });
    const results = await dao.gets(["a", "b", "c"]);
    expect(results[0]?.code).toBe("code-a");
    expect(results[1]?.code).toBe("code-b");
    expect(results[2]).toBeUndefined();
  });

  it("saveToOPFS 仅写 OPFS 不写 chrome.storage.local", async () => {
    await dao.saveToOPFS({ uuid: "opfs-only", code: "opfs code" });
    const storageResult = await new Promise<any>((resolve) => {
      chrome.storage.local.get("scriptCode:opfs-only", resolve);
    });
    expect(storageResult["scriptCode:opfs-only"]).toBeUndefined();
    const result = await dao.get("opfs-only");
    expect(result).toBeDefined();
    expect(result!.code).toBe("opfs code");
  });
});
