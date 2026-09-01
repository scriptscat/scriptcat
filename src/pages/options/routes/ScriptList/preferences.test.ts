import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCRIPT_LIST_PREFERENCES,
  parseScriptListPreferences,
  SCRIPT_LIST_PREFERENCES_KEY,
} from "./preferences";

describe("脚本列表偏好解析", () => {
  it("列表成为唯一视图后，偏好里不再有 viewMode 字段", () => {
    expect(DEFAULT_SCRIPT_LIST_PREFERENCES).not.toHaveProperty("viewMode");
  });

  it("忽略历史遗留的 viewMode，同一份偏好里的筛选、搜索与排序照常读出", () => {
    const raw = JSON.stringify({
      viewMode: "card",
      selectedFilters: { status: 1, type: 2, tags: "tool", source: "example.com" },
      searchRequest: { keyword: "helper", type: "name" },
      sortState: { key: "updatetime", order: "desc" },
    });

    expect(parseScriptListPreferences(raw)).toEqual({
      selectedFilters: { status: 1, type: 2, tags: "tool", source: "example.com" },
      searchRequest: { keyword: "helper", type: "name" },
      sortState: { key: "updatetime", order: "desc" },
    });
  });

  it("没有存过偏好时回退默认值", () => {
    expect(parseScriptListPreferences(null)).toEqual(DEFAULT_SCRIPT_LIST_PREFERENCES);
  });

  it("遇到损坏数据时应回退默认值", () => {
    expect(parseScriptListPreferences("{bad")).toEqual(DEFAULT_SCRIPT_LIST_PREFERENCES);
  });

  it("导出稳定的 localStorage key", () => {
    expect(SCRIPT_LIST_PREFERENCES_KEY).toBe("script-list-preferences");
  });
});
