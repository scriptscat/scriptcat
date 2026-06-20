// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
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

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockedUseIsMobile = vi.mocked(useIsMobile);

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  mockMatchMedia(true);
  mockedUseIsMobile.mockReturnValue(true);
});

afterEach(() => cleanup());

// ── Tests ────────────────────────────────────────────────────────────────────

describe("订阅列表移动端卡片外壳", () => {
  it("移动端渲染订阅卡片而非横向滚动的宽表格", () => {
    const { container, queryByTestId } = renderWithRouterTooltip(<SubscribeList />);
    // 出现卡片
    expect(queryByTestId("subscribe-card")).toBeInTheDocument();
    // 不再出现需要横向滚动的宽表格
    expect(container.querySelector(".min-w-\\[820px\\]")).toBeNull();
  });

  it("卡片内保留各列数据：名称、版本、来源徽章、更新时间、启用开关与删除按钮", () => {
    const { getByTestId } = renderWithRouterTooltip(<SubscribeList />);
    const card = getByTestId("subscribe-card");

    // 名称（标识）
    expect(card.textContent).toContain("我的订阅");
    // 版本
    expect(card.textContent).toContain("1.2.3");
    // 来源徽章（订阅地址）
    expect(card.textContent).toContain(t("script:subscribe_url"));
    // 启用开关（role=switch）
    expect(card.querySelector('[role="switch"]')).not.toBeNull();
    // 删除按钮（aria-label=删除）
    expect(card.querySelector(`[aria-label="${t("delete")}"]`)).not.toBeNull();
    // 检查更新入口（更新时间单元格内）
    expect(card.querySelector(`[aria-label="${t("check_update")}"]`)).not.toBeNull();
  });

  it("桌面端仍渲染含横向滚动宽表格的表格视图", () => {
    mockedUseIsMobile.mockReturnValue(false);
    const { container, queryByTestId } = renderWithRouterTooltip(<SubscribeList />);
    expect(queryByTestId("subscribe-card")).toBeNull();
    expect(container.querySelector(".min-w-\\[820px\\]")).not.toBeNull();
  });
});
