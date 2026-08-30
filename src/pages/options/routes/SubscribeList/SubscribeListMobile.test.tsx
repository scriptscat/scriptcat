import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { cleanup, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithRouterTooltip } from "@Tests/renderWithTooltip";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { SubscribeStatusType } from "@App/app/repo/subscribe";
import { t } from "@App/locales/locales";
import type { SubscribeLoading } from "@App/pages/store/features/subscribe";
import SubscribeList from "./index";

// ── Top-level mocks ──────────────────────────────────────────────────────────

vi.mock("@App/pages/components/use-is-mobile", () => ({
  useIsMobile: vi.fn(),
  MOBILE_BREAKPOINT: 768,
}));

// 引用稳定：index.tsx 把 subscribeList 放进 useMemo / useCallback 依赖，
// 每次返回新对象会触发重渲染循环。
const sampleSubscribe: SubscribeLoading = {
  url: "https://example.com/feed.user.sub.js",
  name: "我的订阅",
  code: "",
  author: "tester",
  scripts: { s1: { uuid: "s1", url: "https://example.com/a.user.js" } },
  metadata: { version: ["1.2.3"], connect: ["example.com"] },
  status: SubscribeStatusType.enable,
  createtime: 1700000000000,
  updatetime: 1700000100000,
  checktime: 1700000100000,
};

const stableSubscribeList: SubscribeLoading[] = [sampleSubscribe];
const stableSetSubscribeList = vi.fn();

vi.mock("./hooks", () => ({
  useSubscribeDataManagement: () => ({
    subscribeList: stableSubscribeList,
    setSubscribeList: stableSetSubscribeList,
    loadingList: false,
  }),
}));

vi.mock("@App/pages/store/features/subscribe", () => ({
  requestDeleteSubscribe: vi.fn(() => Promise.resolve(true)),
  requestEnableSubscribe: vi.fn(() => Promise.resolve(true)),
  requestCheckSubscribeUpdate: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@App/pages/components/ui/toast", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
    undo: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockedUseIsMobile = vi.mocked(useIsMobile);

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  mockMatchMedia(true);
  mockedUseIsMobile.mockReturnValue(true);
});

afterEach(() => cleanup());

// ── Tests ────────────────────────────────────────────────────────────────────

describe("订阅列表移动端列表行", () => {
  it("移动端渲染移动端列表行而非桌面列表行", () => {
    const { container } = renderWithRouterTooltip(<SubscribeList />);

    expect(container.querySelector('[data-slot="mobile-list-row"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="list-row"]')).toBeNull();
  });

  it("行上保留名称、版本与启用开关，删除与检查更新落在左滑与操作面板里", () => {
    const { container } = renderWithRouterTooltip(<SubscribeList />);
    const row = container.querySelector('[data-slot="mobile-list-row"]')!;

    expect(row.textContent).toContain("我的订阅");
    expect(row.textContent).toContain("1.2.3");
    expect(row.querySelector('[role="switch"]')).not.toBeNull();

    // 左滑露出删除
    const swipe = container.querySelector('[data-slot="mobile-swipe-row"]')!;
    fireEvent.touchStart(swipe, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(swipe, { changedTouches: [{ clientX: 100 }] });
    expect(container.querySelector('[data-slot="mobile-swipe-actions"]')!.textContent).toContain(t("delete"));

    // 整行点击打开操作面板，来源徽章、更新时间与检查更新入口都在面板里
    fireEvent.click(container.querySelector('[data-slot="mobile-list-row-main"]')!);
    const sheet = document.querySelector('[data-slot="mobile-action-sheet"]')!;
    expect(sheet.textContent).toContain(t("script:subscribe_url"));
    expect(sheet.querySelector(`[aria-label="${t("check_update")}"]`)).not.toBeNull();
    expect(sheet.textContent).toContain(t("delete"));
  });

  it("桌面端渲染桌面列表行而非移动端行", () => {
    mockedUseIsMobile.mockReturnValue(false);
    const { container } = renderWithRouterTooltip(<SubscribeList />);
    expect(container.querySelector('[data-slot="mobile-list-row"]')).toBeNull();
    expect(container.querySelector('[data-slot="list-row"]')).not.toBeNull();
  });
});
