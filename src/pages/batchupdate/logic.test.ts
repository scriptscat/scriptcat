import { describe, it, expect } from "vitest";
import { initLanguage } from "@App/locales/locales";
import type { Script } from "@App/app/repo/scripts";
import type { TBatchUpdateRecord, TBatchUpdateRecordObject } from "@App/app/service/service_worker/types";
import { riskLevel, getSource, toUpdateItem, categorize, assembleRecord } from "./logic";

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

function mkRecord(
  p: {
    uuid?: string;
    name?: string;
    oldVersion?: string;
    newVersion?: string;
    similarity?: number;
    withNewConnect?: boolean;
    sites?: string[];
    status?: 1 | 2;
    ignoreVersion?: string;
    downloadUrl?: string;
    originDomain?: string;
    icon?: string;
    icon64?: string;
    oldConnect?: string[];
    newConnect?: string[];
  } = {}
): TBatchUpdateRecord {
  const oldVersion = p.oldVersion ?? "1.0.0";
  const newVersion = p.newVersion ?? "2.0.0";
  return {
    uuid: p.uuid ?? "u",
    checkUpdate: true,
    oldCode: "",
    newCode: "",
    newMeta: { version: [newVersion], connect: p.newConnect ?? [] },
    script: mkScript({
      uuid: p.uuid ?? "u",
      name: p.name ?? "脚本",
      status: p.status ?? 1,
      ignoreVersion: p.ignoreVersion,
      downloadUrl: p.downloadUrl,
      originDomain: p.originDomain,
      metadata: {
        version: [oldVersion],
        ...(p.icon ? { icon: [p.icon] } : {}),
        ...(p.icon64 ? { icon64: [p.icon64] } : {}),
        ...(p.oldConnect ? { connect: p.oldConnect } : {}),
      },
    }),
    codeSimilarity: p.similarity ?? 1,
    sites: p.sites ?? [],
    withNewConnect: p.withNewConnect ?? false,
  };
}

describe("riskLevel 代码变化风险分级", () => {
  it("相似度 < 0.75 视为变化大(major)", () => {
    expect(riskLevel(0)).toBe("major");
    expect(riskLevel(0.5)).toBe("major");
    expect(riskLevel(0.7499)).toBe("major");
  });
  it("相似度落在 [0.75, 0.95) 视为有变化(noticeable)", () => {
    expect(riskLevel(0.75)).toBe("noticeable");
    expect(riskLevel(0.9)).toBe("noticeable");
    expect(riskLevel(0.9499)).toBe("noticeable");
  });
  it("相似度 >= 0.95 视为变化小(tiny)", () => {
    expect(riskLevel(0.95)).toBe("tiny");
    expect(riskLevel(1)).toBe("tiny");
  });
});

describe("getSource 来源域名推导", () => {
  it("优先取脚本来源域名 originDomain", () => {
    expect(getSource(mkRecord({ originDomain: "greasyfork.org", downloadUrl: "https://example.com/a.user.js" }))).toBe(
      "greasyfork.org"
    );
  });
  it("无 originDomain 时回退到 downloadUrl 的域名", () => {
    expect(getSource(mkRecord({ downloadUrl: "https://github.com/u/repo/raw/a.user.js" }))).toBe("github.com");
  });
  it("两者皆无时返回空串", () => {
    expect(getSource(mkRecord({}))).toBe("");
  });
});

describe("toUpdateItem 记录转视图模型", () => {
  it("checkUpdate 为 false 的记录返回 null", () => {
    const rec: TBatchUpdateRecord = { uuid: "x", checkUpdate: false };
    expect(toUpdateItem(rec)).toBeNull();
  });
  it("提取 uuid/名称/启用状态/新旧版本/相似度/新连接/来源", () => {
    const item = toUpdateItem(
      mkRecord({
        uuid: "a",
        name: "测试脚本",
        oldVersion: "1.2.0",
        newVersion: "1.3.0",
        similarity: 0.8,
        withNewConnect: true,
        status: 2,
        originDomain: "scriptcat.org",
      })
    );
    expect(item).toMatchObject({
      uuid: "a",
      name: "测试脚本",
      enabled: false,
      oldVersion: "1.2.0",
      newVersion: "1.3.0",
      similarity: 0.8,
      risk: "noticeable",
      withNewConnect: true,
      source: "scriptcat.org",
      ignored: false,
    });
  });
  it("脚本名优先取当前语言的本地化名称(@name:zh-CN)", () => {
    initLanguage("zh-CN");
    const rec = mkRecord({ name: "Raw English Name" });
    rec.script!.metadata["name:zh-cn"] = ["中文脚本名"];
    expect(toUpdateItem(rec)!.name).toBe("中文脚本名");
  });
  it("无本地化名称时回退到脚本原名", () => {
    initLanguage("zh-CN");
    expect(toUpdateItem(mkRecord({ name: "Plain Name" }))!.name).toBe("Plain Name");
  });
  it("忽略版本等于新版本时标记为 ignored", () => {
    const item = toUpdateItem(mkRecord({ newVersion: "2.0.0", ignoreVersion: "2.0.0" }));
    expect(item?.ignored).toBe(true);
  });
  it("忽略版本与新版本不一致时不标记为 ignored", () => {
    const item = toUpdateItem(mkRecord({ newVersion: "2.0.0", ignoreVersion: "1.5.0" }));
    expect(item?.ignored).toBe(false);
  });
  it("从 metadata.icon 提取脚本图标 URL", () => {
    expect(toUpdateItem(mkRecord({ icon: "https://x.test/icon.png" }))?.iconUrl).toBe("https://x.test/icon.png");
  });
  it("icon 缺失时回退到 icon64", () => {
    expect(toUpdateItem(mkRecord({ icon64: "data:image/png;base64,AAA" }))?.iconUrl).toBe("data:image/png;base64,AAA");
  });
  it("无图标时 iconUrl 为空串", () => {
    expect(toUpdateItem(mkRecord({}))?.iconUrl).toBe("");
  });
  it("newConnects 仅包含旧版本未声明的新增连接域名", () => {
    const item = toUpdateItem(mkRecord({ oldConnect: ["a.com"], newConnect: ["a.com", "b.com", "c.com"] }));
    expect(item?.newConnects).toEqual(["b.com", "c.com"]);
  });
});

describe("categorize 记录分组为更新/已忽略", () => {
  it("跳过 checkUpdate 为 false 的记录", () => {
    const { updates, ignored } = categorize([{ uuid: "x", checkUpdate: false }]);
    expect(updates).toHaveLength(0);
    expect(ignored).toHaveLength(0);
  });
  it("忽略版本等于新版本的记录归入 ignored,其余归入 updates", () => {
    const records = [
      mkRecord({ uuid: "a", newVersion: "2.0.0" }),
      mkRecord({ uuid: "b", newVersion: "2.0.0", ignoreVersion: "2.0.0" }),
      mkRecord({ uuid: "c", newVersion: "3.0.0" }),
    ];
    const { updates, ignored } = categorize(records);
    expect(updates.map((u) => u.uuid)).toEqual(["a", "c"]);
    expect(ignored.map((u) => u.uuid)).toEqual(["b"]);
  });
  it("未传 site 时不标记匹配,保持原有顺序", () => {
    const records = [mkRecord({ uuid: "a", sites: ["other.com"] }), mkRecord({ uuid: "b", sites: ["example.com"] })];
    const { updates } = categorize(records);
    expect(updates.map((u) => u.uuid)).toEqual(["a", "b"]);
    expect(updates.every((u) => u.siteMatch === false)).toBe(true);
  });
  it("传入 site 时把命中该站点的更新排到最前并标记 siteMatch", () => {
    const records = [
      mkRecord({ uuid: "a", sites: ["other.com"] }),
      mkRecord({ uuid: "b", sites: ["example.com"] }),
      mkRecord({ uuid: "c", sites: ["x.com", "example.com"] }),
      mkRecord({ uuid: "d", sites: [] }),
    ];
    const { updates } = categorize(records, "example.com");
    // 命中 example.com 的 b、c 排到最前(保持彼此相对顺序),其余在后
    expect(updates.map((u) => u.uuid)).toEqual(["b", "c", "a", "d"]);
    expect(updates.find((u) => u.uuid === "b")?.siteMatch).toBe(true);
    expect(updates.find((u) => u.uuid === "c")?.siteMatch).toBe(true);
    expect(updates.find((u) => u.uuid === "a")?.siteMatch).toBe(false);
    expect(updates.find((u) => u.uuid === "d")?.siteMatch).toBe(false);
  });
  it("已忽略的记录不参与 site 优先级排序", () => {
    const records = [
      mkRecord({ uuid: "a", sites: ["other.com"] }),
      mkRecord({ uuid: "b", newVersion: "2.0.0", ignoreVersion: "2.0.0", sites: ["example.com"] }),
    ];
    const { updates, ignored } = categorize(records, "example.com");
    expect(updates.map((u) => u.uuid)).toEqual(["a"]);
    expect(ignored.map((u) => u.uuid)).toEqual(["b"]);
  });
});

describe("assembleRecord 拼接分片并解析", () => {
  it("按分片顺序拼接并解析 JSON", async () => {
    const obj: TBatchUpdateRecordObject = { checktime: 123, list: [mkRecord({ uuid: "a" })] };
    const full = JSON.stringify(obj);
    const mid = Math.floor(full.length / 2);
    const chunks = [full.slice(0, mid), full.slice(mid)];
    const fetchChunk = async (i: number) => ({ chunk: chunks[i] || "", ended: i >= chunks.length - 1 });
    const result = await assembleRecord(fetchChunk);
    expect(result).toEqual(obj);
  });
  it("拼接结果为空时返回 null", async () => {
    const fetchChunk = async () => ({ chunk: "", ended: true });
    expect(await assembleRecord(fetchChunk)).toBeNull();
  });
});
