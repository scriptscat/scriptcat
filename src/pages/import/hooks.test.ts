// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import type { Script } from "@App/app/repo/scripts";
import type { ScriptBackupData, SubscribeBackupData } from "@App/pkg/backup/struct";

// useImport 通过 cache→fetch→zip→parse→prepare 装配数据,再逐项调用 store clients 导入。
// 这里把这些副作用全部打桩,验证「装配/默认勾选/状态机/导入编排」逻辑。
const h = vi.hoisted(() => ({
  backup: { script: [] as ScriptBackupData[], subscribe: [] as SubscribeBackupData[] },
  cacheGet: vi.fn(),
  fetch: vi.fn(),
  loadAsyncJSZip: vi.fn(() => Promise.resolve("ZIP")),
  parseBackupZipFile: vi.fn(),
  prepareScriptByCode: vi.fn(),
  prepareSubscribeByCode: vi.fn(),
  install: vi.fn((_params: { script: { uuid: string; sort?: number }; code: string }) =>
    Promise.resolve({ update: false, updatetime: 0 })
  ),
  importResources: vi.fn((..._args: unknown[]) => Promise.resolve()),
  setScriptValues: vi.fn((_params: { uuid: string; isReplace: boolean }) => Promise.resolve()),
  subscribeInstall: vi.fn((_subscribe: { url: string }) => Promise.resolve("url")),
}));

function mkScript(p: Partial<Script>): Script {
  return {
    uuid: "u",
    name: "脚本",
    namespace: "",
    metadata: { version: ["1.0.0"] },
    type: 1,
    status: 1,
    sort: 0,
    runStatus: "complete",
    createtime: 0,
    checktime: 0,
    ...p,
  } as Script;
}

vi.mock("@App/app/cache", () => ({ cacheInstance: { get: h.cacheGet } }));
vi.mock("@App/app/cache_key", () => ({ CACHE_KEY_IMPORT_FILE: "importFile:" }));
vi.mock("@App/pkg/utils/jszip-x", () => ({ loadAsyncJSZip: h.loadAsyncJSZip }));
vi.mock("@App/pkg/backup/utils", () => ({ parseBackupZipFile: h.parseBackupZipFile }));
vi.mock("@App/pkg/utils/script", () => ({
  prepareScriptByCode: h.prepareScriptByCode,
  prepareSubscribeByCode: h.prepareSubscribeByCode,
}));
vi.mock("@App/app/repo/scripts", () => ({
  SCRIPT_STATUS_ENABLE: 1,
  SCRIPT_STATUS_DISABLE: 2,
  ScriptDAO: class {
    enableCache() {}
  },
}));
vi.mock("@App/pages/store/features/script", () => ({
  scriptClient: { install: h.install },
  synchronizeClient: { importResources: h.importResources },
  valueClient: { setScriptValues: h.setScriptValues },
  subscribeClient: { install: h.subscribeInstall },
}));

import { useImport } from "./hooks";

function mkBackupScript(p: {
  name: string;
  uuid: string;
  fileUrl?: string;
  values?: Record<string, unknown>;
  resources?: unknown[];
}): ScriptBackupData {
  return {
    code: `// ${p.name}`,
    storage: { data: p.values ?? {}, ts: 0 },
    requires: [],
    requiresCss: [],
    resources: (p.resources as never) ?? [],
    options: {
      options: {} as never,
      settings: { enabled: true, position: 0 },
      meta: { name: p.name, uuid: p.uuid, sc_uuid: p.uuid, modified: 0, file_url: p.fileUrl ?? "" },
    },
  };
}

function mkBackupSubscribe(url: string, name: string): SubscribeBackupData {
  return {
    source: `// ${name}`,
    options: { settings: { enabled: true }, scripts: {}, meta: { name, url, modified: 0 } },
  };
}

beforeEach(() => {
  initLanguage("zh-CN");
  vi.clearAllMocks();
  h.backup = { script: [], subscribe: [] };
  h.cacheGet.mockResolvedValue({ filename: "backup.zip", url: "blob:abc" });
  h.fetch.mockResolvedValue({ blob: () => Promise.resolve("BLOB") });
  global.fetch = h.fetch as unknown as typeof fetch;
  h.parseBackupZipFile.mockImplementation(() => Promise.resolve(h.backup));
  // prepareScriptByCode:正常返回以 sc_uuid 为 uuid 的脚本;code 含 BAD 时抛错
  h.prepareScriptByCode.mockImplementation((code: string, _origin: string, uuid?: string) => {
    if (code.includes("BAD")) return Promise.reject(new Error("parse error"));
    return Promise.resolve({ script: mkScript({ uuid: uuid || "gen", name: code.replace("// ", ""), status: 1 }) });
  });
  h.prepareSubscribeByCode.mockImplementation((_code: string, url: string) =>
    Promise.resolve({ subscribe: { url, name: "订阅" } })
  );
  window.history.replaceState(null, "", "/import.html?uuid=abc");
});

async function renderLoaded(scripts: ScriptBackupData[], subscribe: SubscribeBackupData[] = []) {
  h.backup = { script: scripts, subscribe };
  const r = renderHook(() => useImport());
  await waitFor(() => expect(r.result.current.phase).not.toBe("loading"));
  return r;
}

describe("useImport 装配与默认勾选", () => {
  it("从 uuid 读取备份并渲染脚本与订阅,默认全选可导入项", async () => {
    const { result } = await renderLoaded(
      [mkBackupScript({ name: "脚本A", uuid: "a" }), mkBackupScript({ name: "脚本B", uuid: "b" })],
      [mkBackupSubscribe("https://x/s.sub.js", "订阅1")]
    );
    expect(result.current.phase).toBe("ready");
    expect(result.current.scripts).toHaveLength(2);
    expect(result.current.subscribes).toHaveLength(1);
    expect(result.current.selectedScripts).toEqual(new Set(["a", "b"]));
    expect(result.current.selectedSubscribes).toEqual(new Set(["https://x/s.sub.js"]));
    expect(result.current.filename).toBe("backup.zip");
  });

  it("uuid 无对应缓存时进入加载失败(invalid)", async () => {
    h.cacheGet.mockResolvedValue(undefined);
    const { result } = await renderLoaded([mkBackupScript({ name: "x", uuid: "a" })]);
    expect(result.current.phase).toBe("invalid");
  });

  it("解析失败的脚本标记 error 且不计入默认勾选", async () => {
    const { result } = await renderLoaded([
      mkBackupScript({ name: "好", uuid: "ok" }),
      { ...mkBackupScript({ name: "坏", uuid: "bad" }), code: "// BAD" },
    ]);
    const bad = result.current.scripts.find((s) => s.op === "error");
    expect(bad).toBeTruthy();
    expect(result.current.selectedScripts.has("ok")).toBe(true);
    expect(result.current.selectedScripts.size).toBe(1);
  });

  it("备份不含任何项时进入空备份(empty)", async () => {
    const { result } = await renderLoaded([], []);
    expect(result.current.phase).toBe("empty");
  });

  it("fetch/解析异常进入加载失败(error)并带错误信息", async () => {
    h.parseBackupZipFile.mockRejectedValue(new Error("failed to parse zip"));
    const { result } = await renderLoaded([mkBackupScript({ name: "x", uuid: "a" })]);
    expect(result.current.phase).toBe("error");
    expect(result.current.errorMessage).toContain("failed to parse zip");
  });
});

describe("useImport 导入编排", () => {
  it("点击导入对已勾选脚本调用 install / importResources / setScriptValues 并进入完成", async () => {
    const { result } = await renderLoaded([
      mkBackupScript({ name: "带数据", uuid: "a", values: { k: 1 }, resources: [{ meta: {} }] }),
    ]);
    await act(async () => {
      await result.current.onImport();
    });
    expect(h.install).toHaveBeenCalledTimes(1);
    expect(h.install.mock.calls[0][0]).toMatchObject({ code: "// 带数据" });
    expect(h.importResources).toHaveBeenCalledTimes(1);
    expect(h.setScriptValues).toHaveBeenCalledTimes(1);
    expect(h.setScriptValues.mock.calls[0][0]).toMatchObject({ uuid: "a", isReplace: false });
    expect(result.current.phase).toBe("done");
    expect(result.current.summary.scripts).toBe(1);
    expect(result.current.summary.values).toBe(1);
  });

  it("未勾选的脚本在导入时被跳过,不调用 install", async () => {
    const { result } = await renderLoaded([
      mkBackupScript({ name: "A", uuid: "a" }),
      mkBackupScript({ name: "B", uuid: "b" }),
    ]);
    act(() => result.current.onToggleScript("b")); // 取消勾选 b
    await act(async () => {
      await result.current.onImport();
    });
    expect(h.install).toHaveBeenCalledTimes(1);
    expect(h.install.mock.calls[0][0].script.uuid).toBe("a");
  });

  it("已勾选的订阅在导入时调用 subscribeClient.install", async () => {
    const { result } = await renderLoaded([], [mkBackupSubscribe("https://x/s.sub.js", "订阅1")]);
    await act(async () => {
      await result.current.onImport();
    });
    expect(h.subscribeInstall).toHaveBeenCalledTimes(1);
    expect(h.subscribeInstall.mock.calls[0][0]).toMatchObject({ url: "https://x/s.sub.js" });
  });

  it("导入时保留备份中的脚本排序位置(sort = options.settings.position)", async () => {
    const s = mkBackupScript({ name: "排序脚本", uuid: "p" });
    s.options!.settings.position = 7;
    const { result } = await renderLoaded([s]);
    await act(async () => {
      await result.current.onImport();
    });
    expect(h.install.mock.calls[0][0].script.sort).toBe(7);
  });

  it("无 values/资源的脚本导入时只调用 install,不调用 importResources/setScriptValues", async () => {
    const { result } = await renderLoaded([mkBackupScript({ name: "纯脚本", uuid: "a" })]);
    await act(async () => {
      await result.current.onImport();
    });
    expect(h.install).toHaveBeenCalledTimes(1);
    expect(h.importResources).not.toHaveBeenCalled();
    expect(h.setScriptValues).not.toHaveBeenCalled();
  });
});
