// can be tested with vitest-environment node
import { describe, it, expect } from "vitest";
import {
  resolveConfirmType,
  availableDurations,
  canApplyToAll,
  isSiteAccess,
  isHighSensitive,
} from "./confirm-options";
import type { ConfirmParam } from "@App/app/service/service_worker/permission_verify";

const cp = (over: Partial<ConfirmParam> = {}): ConfirmParam => ({ permission: "cors", ...over });

describe("授权选项 · 时长与范围到 type 的映射", () => {
  it("仅此次应映射为 type 1（与是否通配无关）", () => {
    expect(resolveConfirmType("once", false)).toBe(1);
    expect(resolveConfirmType("once", true)).toBe(1);
  });
  it("临时·仅此项应为 type 3，临时·全部应为 type 2", () => {
    expect(resolveConfirmType("temporary", false)).toBe(3);
    expect(resolveConfirmType("temporary", true)).toBe(2);
  });
  it("永久·仅此项应为 type 5，永久·全部应为 type 4", () => {
    expect(resolveConfirmType("permanent", false)).toBe(5);
    expect(resolveConfirmType("permanent", true)).toBe(4);
  });
});

describe("授权选项 · 可选时长", () => {
  it("普通权限应提供 仅此次/临时/永久", () => {
    expect(availableDurations(cp())).toEqual(["once", "temporary", "permanent"]);
  });
  it("persistentOnly 权限应隐藏「临时」（临时不会被缓存，等同一次性）", () => {
    expect(availableDurations(cp({ persistentOnly: true }))).toEqual(["once", "permanent"]);
  });
});

describe("授权选项 · 通配范围开关可见性", () => {
  it("非通配权限不显示通配开关", () => {
    expect(canApplyToAll(cp({ wildcard: false }), 5)).toBe(false);
  });
  it("通配权限但同类等待请求未超过 2 个时不显示", () => {
    expect(canApplyToAll(cp({ wildcard: true }), 2)).toBe(false);
  });
  it("通配权限且同类等待请求超过 2 个时显示", () => {
    expect(canApplyToAll(cp({ wildcard: true }), 3)).toBe(true);
  });
});

describe("授权选项 · 高敏感权限警示", () => {
  it("cookie 权限应标记为高敏感（展示警示条）", () => {
    expect(isHighSensitive(cp({ permission: "cookie" }))).toBe(true);
  });
  it("cors/文件存储等不标记为高敏感", () => {
    expect(isHighSensitive(cp({ permission: "cors" }))).toBe(false);
    expect(isHighSensitive(cp({ permission: "file_storage" }))).toBe(false);
  });
});

describe("授权选项 · 站点访问识别", () => {
  it("extension-site-access 应识别为站点访问（单按钮变体）", () => {
    expect(isSiteAccess(cp({ permission: "extension-site-access" }))).toBe(true);
  });
  it("其它权限不是站点访问", () => {
    expect(isSiteAccess(cp({ permission: "cors" }))).toBe(false);
  });
});
