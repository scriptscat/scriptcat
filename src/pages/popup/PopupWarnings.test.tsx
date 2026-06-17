import { describe, it, expect } from "vitest";
import { BrowserType } from "@App/pkg/utils/utils";
import type { getBrowserType } from "@App/pkg/utils/utils";
import { getUserScriptsWarning } from "./PopupWarnings";

type BT = ReturnType<typeof getBrowserType>;
const base: BT = { firefox: 0, webkit: 0, chrome: 0, unknown: 0, chromeVersion: 0, device: 0 };

describe("getUserScriptsWarning 用户脚本不可用时的提示选择", () => {
  it("Firefox 提示开发者模式（browser=firefox）", () => {
    expect(getUserScriptsWarning({ ...base, firefox: 1 })).toEqual({ key: "develop_mode_guide", browser: "firefox" });
  });

  it("Chrome 低版本无 UserScripts API 提示升级浏览器", () => {
    expect(getUserScriptsWarning({ ...base, chrome: BrowserType.Chrome | BrowserType.noUserScriptsAPI })).toEqual({
      key: "lower_version_browser_guide",
    });
  });

  it("Chrome 需开发者模式（browser=chrome）", () => {
    expect(getUserScriptsWarning({ ...base, chrome: BrowserType.Chrome | BrowserType.guardedByDeveloperMode })).toEqual(
      { key: "develop_mode_guide", browser: "chrome" }
    );
  });

  it("Edge 需开发者模式（browser=edge）", () => {
    expect(getUserScriptsWarning({ ...base, chrome: BrowserType.Edge | BrowserType.guardedByDeveloperMode })).toEqual({
      key: "develop_mode_guide",
      browser: "edge",
    });
  });

  it("Edge 需允许用户脚本（browser=edge）", () => {
    expect(getUserScriptsWarning({ ...base, chrome: BrowserType.Edge | BrowserType.guardedByAllowScript })).toEqual({
      key: "allow_user_script_guide",
      browser: "edge",
    });
  });

  it("Chrome 需允许用户脚本（browser=chrome）", () => {
    expect(getUserScriptsWarning({ ...base, chrome: BrowserType.Chrome | BrowserType.guardedByAllowScript })).toEqual({
      key: "allow_user_script_guide",
      browser: "chrome",
    });
  });
});
