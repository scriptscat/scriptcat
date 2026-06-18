// @vitest-environment node
import { describe, it, expect } from "vitest";
import { filterAndSortSubscribes } from "./filter";
import { SubscribeStatusType } from "@App/app/repo/subscribe";
import type { SubscribeLoading } from "@App/pages/store/features/subscribe";

function makeSub(p: Partial<SubscribeLoading> & { url: string }): SubscribeLoading {
  return {
    code: "",
    author: "",
    scripts: {},
    metadata: {},
    name: p.url,
    status: SubscribeStatusType.enable,
    createtime: 0,
    checktime: 0,
    ...p,
  } as SubscribeLoading;
}

// createtime: x<y<z ; name: Apple(y)<Banana(z)<Cherry(x) ; updatetime: y<z<x
const list: SubscribeLoading[] = [
  makeSub({ url: "x", name: "Cherry", status: SubscribeStatusType.enable, createtime: 1, updatetime: 30 }),
  makeSub({ url: "y", name: "Apple", status: SubscribeStatusType.disable, createtime: 2, updatetime: 10 }),
  makeSub({ url: "z", name: "Banana", status: SubscribeStatusType.enable, createtime: 3, updatetime: 20 }),
];

describe("订阅列表过滤与排序", () => {
  it("无任何条件时原样返回", () => {
    expect(filterAndSortSubscribes(list, { statusFilter: null, keyword: "", sort: null }).map((s) => s.url)).toEqual([
      "x",
      "y",
      "z",
    ]);
  });

  it("状态筛选：仅返回启用项（保持原顺序）", () => {
    const r = filterAndSortSubscribes(list, { statusFilter: SubscribeStatusType.enable, keyword: "", sort: null });
    expect(r.map((s) => s.url)).toEqual(["x", "z"]);
  });

  it("状态筛选：仅返回禁用项", () => {
    const r = filterAndSortSubscribes(list, { statusFilter: SubscribeStatusType.disable, keyword: "", sort: null });
    expect(r.map((s) => s.url)).toEqual(["y"]);
  });

  it("名称搜索：不区分大小写的子串匹配", () => {
    const r = filterAndSortSubscribes(list, { statusFilter: null, keyword: "AN", sort: null });
    expect(r.map((s) => s.name)).toEqual(["Banana"]);
  });

  it("按创建时间升序 / 降序", () => {
    expect(
      filterAndSortSubscribes(list, {
        statusFilter: null,
        keyword: "",
        sort: { field: "createtime", order: "asc" },
      }).map((s) => s.url)
    ).toEqual(["x", "y", "z"]);
    expect(
      filterAndSortSubscribes(list, {
        statusFilter: null,
        keyword: "",
        sort: { field: "createtime", order: "desc" },
      }).map((s) => s.url)
    ).toEqual(["z", "y", "x"]);
  });

  it("按名称升序（localeCompare）", () => {
    const r = filterAndSortSubscribes(list, { statusFilter: null, keyword: "", sort: { field: "name", order: "asc" } });
    expect(r.map((s) => s.name)).toEqual(["Apple", "Banana", "Cherry"]);
  });

  it("按最后更新升序 / 降序（缺失值按 0 处理）", () => {
    expect(
      filterAndSortSubscribes(list, {
        statusFilter: null,
        keyword: "",
        sort: { field: "updatetime", order: "asc" },
      }).map((s) => s.url)
    ).toEqual(["y", "z", "x"]);
    expect(
      filterAndSortSubscribes(list, {
        statusFilter: null,
        keyword: "",
        sort: { field: "updatetime", order: "desc" },
      }).map((s) => s.url)
    ).toEqual(["x", "z", "y"]);
  });

  it("组合：先按状态筛选启用项，再按名称升序", () => {
    const r = filterAndSortSubscribes(list, {
      statusFilter: SubscribeStatusType.enable,
      keyword: "",
      sort: { field: "name", order: "asc" },
    });
    expect(r.map((s) => s.name)).toEqual(["Banana", "Cherry"]);
  });

  it("不修改传入的原数组", () => {
    const before = list.map((s) => s.url);
    filterAndSortSubscribes(list, { statusFilter: null, keyword: "", sort: { field: "name", order: "asc" } });
    expect(list.map((s) => s.url)).toEqual(before);
  });
});
