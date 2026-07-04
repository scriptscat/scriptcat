import { describe, expect, it, vi } from "vitest";
import type { ScriptMenu } from "@App/app/service/service_worker/types";

const mocks = vi.hoisted(() => ({
  getCurrentTab: vi.fn(async () => ({ id: 7, url: "https://example.com/page" })),
  getEnableScript: vi.fn(async () => true),
  getCheckUpdate: vi.fn(async () => ({ notice: "notice", version: "2.0.0", isRead: false })),
  getMenuExpandNum: vi.fn(async () => 8),
  getProvider: vi.fn(async () => "greasyfork"),
  getPopupData: vi.fn(),
}));

vi.mock("@App/pkg/utils/utils", () => ({ getCurrentTab: mocks.getCurrentTab }));
vi.mock("@App/app/cache", () => ({ cacheInstance: { get: mocks.getProvider } }));
vi.mock("../store/global", () => ({
  systemConfig: {
    getEnableScript: mocks.getEnableScript,
    getCheckUpdate: mocks.getCheckUpdate,
    getMenuExpandNum: mocks.getMenuExpandNum,
  },
}));
vi.mock("../store/features/script", () => ({ popupClient: { getPopupData: mocks.getPopupData } }));

import { preloadPopupData } from "./preload";

function script(uuid: string, enable: boolean): ScriptMenu {
  return {
    uuid,
    name: uuid,
    storageName: uuid,
    enable,
    menus: [],
    runNum: 0,
    runNumByIframe: 0,
    updatetime: 0,
    hasUserConfig: false,
    isEffective: true,
  };
}

describe("Popup 数据预加载", () => {
  it("应在 React 挂载前并行读取配置并查询当前标签页脚本", async () => {
    mocks.getPopupData.mockResolvedValue({
      isBlacklist: true,
      scriptList: [script("disabled", false), script("enabled", true)],
      backScriptList: [],
    });

    preloadPopupData();
    await vi.waitFor(() => expect(mocks.getPopupData).toHaveBeenCalled());

    expect(mocks.getPopupData).toHaveBeenCalledWith({ tabId: 7, url: "https://example.com/page" });
  });
});
