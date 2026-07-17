import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCRIPT_LIST_PREFERENCES,
  parseScriptListPreferences,
  SCRIPT_LIST_PREFERENCES_KEY,
  SCRIPT_LIST_VIEW_MODE_KEY,
} from "./preferences";

describe("脚本列表偏好解析", () => {
  it("没有新偏好时应兼容旧版视图模式", () => {
    expect(parseScriptListPreferences(null, "card")).toEqual({
      ...DEFAULT_SCRIPT_LIST_PREFERENCES,
      viewMode: "card",
    });
  });

  it("应读取筛选、搜索与列排序状态", () => {
    const raw = JSON.stringify({
      viewMode: "table",
      selectedFilters: { status: 1, type: 2, tags: "tool", source: "example.com" },
      searchRequest: { keyword: "helper", type: "name" },
      sortState: { key: "updatetime", order: "desc" },
    });

    expect(parseScriptListPreferences(raw, null)).toEqual({
      viewMode: "table",
      selectedFilters: { status: 1, type: 2, tags: "tool", source: "example.com" },
      searchRequest: { keyword: "helper", type: "name" },
      sortState: { key: "updatetime", order: "desc" },
    });
  });

  it("遇到损坏数据时应回退默认值", () => {
    expect(parseScriptListPreferences("{bad", "nope")).toEqual(DEFAULT_SCRIPT_LIST_PREFERENCES);
  });

  it("导出稳定的 localStorage key", () => {
    expect(SCRIPT_LIST_PREFERENCES_KEY).toBe("script-list-preferences");
    expect(SCRIPT_LIST_VIEW_MODE_KEY).toBe("script-list-view-mode");
  });
});
