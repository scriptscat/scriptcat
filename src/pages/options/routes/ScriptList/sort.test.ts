// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { initLanguage } from "@App/locales/locales";
import { SCRIPT_STATUS_ENABLE, SCRIPT_STATUS_DISABLE } from "@App/app/repo/scripts";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { nextSortState, sortScriptList } from "./sort";

beforeEach(() => initLanguage("zh-CN"));

const mk = (over: Partial<ScriptLoading>): ScriptLoading =>
  ({
    uuid: "u",
    name: "x",
    metadata: {},
    status: SCRIPT_STATUS_ENABLE,
    updatetime: 0,
    sort: 0,
    ...over,
  }) as ScriptLoading;

describe("排序状态切换 nextSortState", () => {
  it("点击未激活的列时进入升序", () => {
    expect(nextSortState({ key: null, order: "asc" }, "name")).toEqual({ key: "name", order: "asc" });
  });

  it("再次点击同一列时切换为降序", () => {
    expect(nextSortState({ key: "name", order: "asc" }, "name")).toEqual({ key: "name", order: "desc" });
  });

  it("第三次点击同一列时关闭排序，回到自然顺序", () => {
    expect(nextSortState({ key: "name", order: "desc" }, "name")).toEqual({ key: null, order: "asc" });
  });

  it("点击另一列时重置为该列升序", () => {
    expect(nextSortState({ key: "name", order: "desc" }, "updatetime")).toEqual({ key: "updatetime", order: "asc" });
  });
});

describe("脚本列表排序 sortScriptList", () => {
  it("未排序（key 为 null）时原样返回同一引用", () => {
    const list = [mk({ uuid: "a" }), mk({ uuid: "b" })];
    expect(sortScriptList(list, { key: null, order: "asc" })).toBe(list);
  });

  it("按名称升序 / 降序排序", () => {
    const list = [
      mk({ uuid: "b", name: "Banana" }),
      mk({ uuid: "a", name: "Apple" }),
      mk({ uuid: "c", name: "Cherry" }),
    ];
    expect(sortScriptList(list, { key: "name", order: "asc" }).map((s) => s.uuid)).toEqual(["a", "b", "c"]);
    expect(sortScriptList(list, { key: "name", order: "desc" }).map((s) => s.uuid)).toEqual(["c", "b", "a"]);
  });

  it("按更新时间升序排序", () => {
    const list = [
      mk({ uuid: "x", updatetime: 30 }),
      mk({ uuid: "y", updatetime: 10 }),
      mk({ uuid: "z", updatetime: 20 }),
    ];
    expect(sortScriptList(list, { key: "updatetime", order: "asc" }).map((s) => s.uuid)).toEqual(["y", "z", "x"]);
  });

  it("按启用状态升序时启用项在前（启用 1 < 禁用 2）", () => {
    const list = [mk({ uuid: "off", status: SCRIPT_STATUS_DISABLE }), mk({ uuid: "on", status: SCRIPT_STATUS_ENABLE })];
    expect(sortScriptList(list, { key: "status", order: "asc" }).map((s) => s.uuid)).toEqual(["on", "off"]);
  });

  it("相等元素保持原有相对顺序（稳定排序）", () => {
    const list = [mk({ uuid: "1", updatetime: 5 }), mk({ uuid: "2", updatetime: 5 }), mk({ uuid: "3", updatetime: 5 })];
    expect(sortScriptList(list, { key: "updatetime", order: "desc" }).map((s) => s.uuid)).toEqual(["1", "2", "3"]);
  });

  it("不修改传入的原数组", () => {
    const list = [mk({ uuid: "b", name: "B" }), mk({ uuid: "a", name: "A" })];
    sortScriptList(list, { key: "name", order: "asc" });
    expect(list.map((s) => s.uuid)).toEqual(["b", "a"]);
  });
});
