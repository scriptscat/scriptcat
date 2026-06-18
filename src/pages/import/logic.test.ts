// can be tested with vitest-environment node
import { describe, it, expect } from "vitest";
import { initLanguage } from "@App/locales/locales";
import type { Script } from "@App/app/repo/scripts";
import type { Subscribe } from "@App/app/repo/subscribe";
import type { ScriptData } from "@App/pkg/backup/struct";
import {
  deriveSource,
  countValues,
  hasResources,
  toScriptImportItem,
  toSubscribeImportItem,
  summarize,
  importableScriptIds,
  sortByName,
  type PreparedSubscribe,
  type ScriptImportItem,
} from "./logic";

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

function mkScriptData(p: {
  uuid?: string;
  name?: string;
  status?: 1 | 2;
  version?: string;
  oldVersion?: string;
  author?: string;
  icon?: string;
  icon64?: string;
  fileUrl?: string;
  metaName?: string;
  values?: Record<string, unknown>;
  requires?: unknown[];
  resources?: unknown[];
  requiresCss?: unknown[];
  error?: string;
}): ScriptData {
  const base: ScriptData = {
    code: "// code",
    storage: { data: p.values ?? {}, ts: 0 },
    requires: (p.requires as never) ?? [],
    requiresCss: (p.requiresCss as never) ?? [],
    resources: (p.resources as never) ?? [],
    install: !p.error,
    options: {
      options: {} as never,
      settings: { enabled: true, position: 0 },
      meta: {
        name: p.metaName ?? p.name ?? "脚本",
        uuid: p.uuid ?? "u",
        sc_uuid: p.uuid ?? "u",
        modified: 0,
        file_url: p.fileUrl ?? "",
      },
    },
  };
  if (p.error) {
    base.error = p.error;
    return base;
  }
  const script = mkScript({
    uuid: p.uuid ?? "u",
    name: p.name ?? "脚本",
    status: p.status ?? 1,
    metadata: {
      version: [p.version ?? "1.0.0"],
      ...(p.author ? { author: [p.author] } : {}),
      ...(p.icon ? { icon: [p.icon] } : {}),
      ...(p.icon64 ? { icon64: [p.icon64] } : {}),
    },
  });
  base.script = { script };
  if (p.oldVersion) {
    base.script.oldScript = mkScript({ uuid: p.uuid ?? "u", metadata: { version: [p.oldVersion] } });
  }
  return base;
}

describe("deriveSource 来源推导", () => {
  it("file_url 为标准链接时取域名", () => {
    expect(deriveSource("https://greasyfork.org/scripts/1.user.js")).toEqual({
      kind: "url",
      host: "greasyfork.org",
      full: "https://greasyfork.org/scripts/1.user.js",
    });
  });
  it("file_url 为空时视为本地创建", () => {
    expect(deriveSource("")).toEqual({ kind: "local" });
    expect(deriveSource(undefined)).toEqual({ kind: "local" });
  });
  it("file_url 无法解析为 URL 时回退原文为来源", () => {
    expect(deriveSource("not-a-url")).toEqual({ kind: "url", host: "not-a-url", full: "not-a-url" });
  });
});

describe("countValues / hasResources 数据量推导", () => {
  it("统计 storage.data 的键数量", () => {
    expect(countValues({ data: { a: 1, b: 2, c: 3 }, ts: 0 })).toBe(3);
    expect(countValues({ data: {}, ts: 0 })).toBe(0);
    expect(countValues(undefined)).toBe(0);
  });
  it("requires/resources/requiresCss 任一非空即含资源", () => {
    expect(hasResources(mkScriptData({ resources: [{}] }))).toBe(true);
    expect(hasResources(mkScriptData({ requires: [{}] }))).toBe(true);
    expect(hasResources(mkScriptData({ requiresCss: [{}] }))).toBe(true);
    expect(hasResources(mkScriptData({}))).toBe(false);
  });
});

describe("toScriptImportItem 脚本转视图模型", () => {
  it("无 oldScript 的脚本标记为「新增」且仅有新版本", () => {
    const item = toScriptImportItem(mkScriptData({ uuid: "a", version: "3.2.1" }), 0);
    expect(item.op).toBe("add");
    expect(item.newVersion).toBe("3.2.1");
    expect(item.oldVersion).toBe("");
    expect(item.importable).toBe(true);
    expect(item.uuid).toBe("a");
  });
  it("存在 oldScript 的脚本标记为「更新」且含旧→新版本", () => {
    const item = toScriptImportItem(mkScriptData({ version: "2.0.0", oldVersion: "1.0.0" }), 0);
    expect(item.op).toBe("update");
    expect(item.oldVersion).toBe("1.0.0");
    expect(item.newVersion).toBe("2.0.0");
  });
  it("解析失败的脚本标记为「解析失败」、不可勾选、保留错误信息", () => {
    const item = toScriptImportItem(mkScriptData({ metaName: "坏脚本", error: "Error: boom" }), 2);
    expect(item.op).toBe("error");
    expect(item.importable).toBe(false);
    expect(item.enabled).toBe(false);
    expect(item.name).toBe("坏脚本");
    expect(item.error).toBe("Error: boom");
    expect(item.uuid).toBe("");
  });
  it("含 values 的脚本在数据列给出条数,并标记是否含资源", () => {
    const item = toScriptImportItem(mkScriptData({ values: { x: 1, y: 2 }, resources: [{}] }), 0);
    expect(item.valueCount).toBe(2);
    expect(item.hasResources).toBe(true);
  });
  it("启用态取自脚本 status(1=启用)", () => {
    expect(toScriptImportItem(mkScriptData({ status: 1 }), 0).enabled).toBe(true);
    expect(toScriptImportItem(mkScriptData({ status: 2 }), 0).enabled).toBe(false);
  });
  it("图标优先取 @icon,缺失回退 @icon64", () => {
    expect(toScriptImportItem(mkScriptData({ icon: "http://x/i.png" }), 0).iconUrl).toBe("http://x/i.png");
    expect(toScriptImportItem(mkScriptData({ icon64: "data:image/png;base64,AA" }), 0).iconUrl).toBe(
      "data:image/png;base64,AA"
    );
    expect(toScriptImportItem(mkScriptData({}), 0).iconUrl).toBe("");
  });
  it("脚本名优先取当前语言的本地化名称(@name:zh-CN)", () => {
    initLanguage("zh-CN");
    const data = mkScriptData({ name: "Raw English Name" });
    data.script!.script.metadata["name:zh-cn"] = ["中文脚本名"];
    expect(toScriptImportItem(data, 0).name).toBe("中文脚本名");
  });
  it("作者取自 metadata.author", () => {
    expect(toScriptImportItem(mkScriptData({ author: "CodFrm" }), 0).author).toBe("CodFrm");
  });
});

describe("toSubscribeImportItem 订阅转视图模型", () => {
  function mkPrepared(p: {
    name?: string;
    url?: string;
    oldExists?: boolean;
    error?: string;
    metaName?: string;
    metaUrl?: string;
  }): PreparedSubscribe {
    return {
      data: {
        source: "// sub",
        install: true,
        options: {
          settings: { enabled: true },
          scripts: {},
          meta: { name: p.metaName ?? "", url: p.metaUrl ?? "", modified: 0 },
        },
      },
      subscribe: p.error
        ? undefined
        : ({ url: p.url ?? "https://x/s.sub.js", name: p.name ?? "我的订阅" } as Subscribe),
      oldExists: p.oldExists,
      error: p.error,
    };
  }
  it("无既有订阅时标记为「新增」并取订阅名与 url", () => {
    const item = toSubscribeImportItem(mkPrepared({ name: "我的订阅", url: "https://x/s.sub.js" }), 0);
    expect(item.op).toBe("add");
    expect(item.name).toBe("我的订阅");
    expect(item.url).toBe("https://x/s.sub.js");
    expect(item.importable).toBe(true);
  });
  it("已存在同名订阅时标记为「更新」", () => {
    expect(toSubscribeImportItem(mkPrepared({ oldExists: true }), 0).op).toBe("update");
  });
  it("解析失败时标记为「解析失败」且不可勾选,名称回退备份元数据", () => {
    const item = toSubscribeImportItem(mkPrepared({ error: "bad", metaName: "坏订阅" }), 1);
    expect(item.op).toBe("error");
    expect(item.importable).toBe(false);
    expect(item.name).toBe("坏订阅");
  });
});

describe("importableScriptIds / sortByName / summarize 选择与汇总", () => {
  const a = toScriptImportItem(mkScriptData({ uuid: "a", name: "Bravo", values: { x: 1 } }), 0);
  const b = toScriptImportItem(mkScriptData({ uuid: "b", name: "Alpha", values: { x: 1, y: 2 } }), 1);
  const err = toScriptImportItem(mkScriptData({ uuid: "c", metaName: "坏", error: "x" }), 2);

  it("可导入 id 仅包含未出错的脚本", () => {
    expect(importableScriptIds([a, b, err])).toEqual(["a", "b"]);
  });
  it("按本地化名称排序", () => {
    const sorted = sortByName([a, b]);
    expect(sorted.map((s: ScriptImportItem) => s.uuid)).toEqual(["b", "a"]);
  });
  it("汇总仅统计已勾选且可导入项的脚本数、订阅数与数据条数", () => {
    const sub = toSubscribeImportItem(
      {
        data: { source: "", install: true },
        subscribe: { url: "u1", name: "s" } as Subscribe,
        oldExists: false,
      },
      0
    );
    const result = summarize([a, b, err], [sub], new Set(["a", "b", "c"]), new Set(["u1"]));
    expect(result).toEqual({ scripts: 2, subscribes: 1, values: 3 });
  });
});
