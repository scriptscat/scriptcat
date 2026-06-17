import { describe, it, expect } from "vitest";
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
  } = {}
): TBatchUpdateRecord {
  const oldVersion = p.oldVersion ?? "1.0.0";
  const newVersion = p.newVersion ?? "2.0.0";
  return {
    uuid: p.uuid ?? "u",
    checkUpdate: true,
    oldCode: "",
    newCode: "",
    newMeta: { version: [newVersion], connect: [] },
    script: mkScript({
      uuid: p.uuid ?? "u",
      name: p.name ?? "脚本",
      status: p.status ?? 1,
      ignoreVersion: p.ignoreVersion,
      downloadUrl: p.downloadUrl,
      originDomain: p.originDomain,
      metadata: { version: [oldVersion] },
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
  it("忽略版本等于新版本时标记为 ignored", () => {
    const item = toUpdateItem(mkRecord({ newVersion: "2.0.0", ignoreVersion: "2.0.0" }));
    expect(item?.ignored).toBe(true);
  });
  it("忽略版本与新版本不一致时不标记为 ignored", () => {
    const item = toUpdateItem(mkRecord({ newVersion: "2.0.0", ignoreVersion: "1.5.0" }));
    expect(item?.ignored).toBe(false);
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
