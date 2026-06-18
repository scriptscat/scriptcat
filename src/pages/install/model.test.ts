// can be tested with vitest-environment node
import { describe, it, expect } from "vitest";
import { deriveVersion, deriveAntifeatures, deriveScheduleInfo, deriveDiffStat } from "./model";

describe("deriveVersion 版本展示派生", () => {
  it("全新安装返回单版本展示", () => {
    expect(deriveVersion("2.3.1", null)).toEqual({ kind: "install", version: "2.3.1" });
  });

  it("更新返回旧→新版本展示,版本变化时 changed 为 true", () => {
    expect(deriveVersion("2.3.1", "2.1.0")).toEqual({
      kind: "update",
      oldVersion: "2.1.0",
      newVersion: "2.3.1",
      changed: true,
    });
  });

  it("更新但版本号未变化时 changed 为 false", () => {
    expect(deriveVersion("2.1.0", "2.1.0")).toEqual({
      kind: "update",
      oldVersion: "2.1.0",
      newVersion: "2.1.0",
      changed: false,
    });
  });

  it("缺少版本号时回退为空串", () => {
    expect(deriveVersion(undefined, null)).toEqual({ kind: "install", version: "" });
  });
});

describe("deriveAntifeatures 反特性派生", () => {
  it("解析已知反特性类型,取首个空格前的 token", () => {
    expect(deriveAntifeatures({ antifeature: ["referral-link 含推广链接", "ads"] })).toEqual(["referral-link", "ads"]);
  });

  it("忽略未知反特性类型", () => {
    expect(deriveAntifeatures({ antifeature: ["unknown-thing 描述", "miner"] })).toEqual(["miner"]);
  });

  it("无反特性时返回空数组", () => {
    expect(deriveAntifeatures({})).toEqual([]);
  });
});

describe("deriveScheduleInfo 定时/后台分类派生", () => {
  it("定时脚本返回 cron 分类与表达式", () => {
    expect(deriveScheduleInfo({ crontab: ["0 8 * * *"] })).toEqual({
      kind: "cron",
      expression: "0 8 * * *",
    });
  });

  it("后台脚本返回 background 分类", () => {
    expect(deriveScheduleInfo({ background: [""] })).toEqual({ kind: "background" });
  });

  it("普通脚本返回 null", () => {
    expect(deriveScheduleInfo({})).toBeNull();
  });

  it("同时有 crontab 与 background 时优先 cron", () => {
    expect(deriveScheduleInfo({ crontab: ["* * * * *"], background: [""] })).toEqual({
      kind: "cron",
      expression: "* * * * *",
    });
  });
});

describe("deriveDiffStat 代码增删行统计派生", () => {
  it("纯新增行只计 added", () => {
    expect(deriveDiffStat("a\nb", "a\nb\nc")).toEqual({ added: 1, removed: 0 });
  });

  it("纯删除行只计 removed", () => {
    expect(deriveDiffStat("a\nb\nc", "a\nb")).toEqual({ added: 0, removed: 1 });
  });

  it("替换一行计为一增一删", () => {
    expect(deriveDiffStat("a\nb\nc", "a\nX\nc")).toEqual({ added: 1, removed: 1 });
  });

  it("内容完全相同时增删均为 0", () => {
    expect(deriveDiffStat("a\nb\nc", "a\nb\nc")).toEqual({ added: 0, removed: 0 });
  });
});
