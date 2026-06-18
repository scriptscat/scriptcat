// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage, t } from "@App/locales/locales";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import type { Logger as LoggerEntry } from "@App/app/repo/logger";

// 移动端重壳:整页在 useIsMobile=true 时切换为竖向堆叠布局(图标按钮 + 可横向滚动级别 chip + 消息换行)。
vi.mock("@App/pages/components/use-is-mobile", () => ({
  useIsMobile: vi.fn(),
  MOBILE_BREAKPOINT: 768,
}));

const sampleLogs: LoggerEntry[] = [
  { id: 1, level: "error", message: "GM_xhr connect failed", label: { component: "GM_xhr" }, createtime: 3 },
  { id: 2, level: "warn", message: "retry timeout reached", label: { component: "GM_log" }, createtime: 2 },
  { id: 3, level: "info", message: "userscript started ok", label: { component: "GM_log" }, createtime: 1 },
];

const { mockLoggerData } = vi.hoisted(() => ({
  mockLoggerData: {
    logs: [] as LoggerEntry[],
    loading: false,
    reload: vi.fn(),
    clearLogs: vi.fn(() => Promise.resolve()),
    deleteLogs: vi.fn(() => Promise.resolve()),
    cleanCycle: 7,
    setCleanCycle: vi.fn(),
    refreshInterval: "off" as const,
    setRefreshInterval: vi.fn(),
    preset: "24h" as const,
    setPreset: vi.fn(),
    isNow: true,
    setIsNow: vi.fn(),
    range: { start: 0, end: 1 },
    setRange: vi.fn(),
    initialQueries: [],
  },
}));
vi.mock("./hooks", () => ({ useLogger: () => mockLoggerData }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import Logger from "./index";

const mockedUseIsMobile = vi.mocked(useIsMobile);
const renderPage = () => render(<Logger />, { wrapper: MemoryRouter });

beforeEach(() => {
  initLanguage("zh-CN");
  mockLoggerData.logs = sampleLogs;
  mockedUseIsMobile.mockReturnValue(true);
  vi.clearAllMocks();
  mockedUseIsMobile.mockReturnValue(true);
});

afterEach(() => cleanup());

describe("日志页面 - 移动端", () => {
  it("移动端顶栏的删除/清空按钮以图标按钮呈现(带无障碍名,不显示文字标签)", () => {
    renderPage();
    const del = screen.getByRole("button", { name: t("logs:delete_current_logs") });
    const clear = screen.getByRole("button", { name: t("logs:clear_logs") });
    // 图标按钮:可见文本里不再包含完整中文标签
    expect(del.textContent).not.toContain(t("logs:delete_current_logs"));
    expect(clear.textContent).not.toContain(t("logs:clear_logs"));
  });

  it("移动端日志行的消息允许换行而非截断", () => {
    renderPage();
    const msg = screen.getByText("GM_xhr connect failed");
    expect(msg.className).not.toContain("truncate");
  });

  it("移动端级别筛选条可横向滚动", () => {
    renderPage();
    expect(screen.getByTestId("level-chip-bar").className).toContain("overflow-x-auto");
  });

  it("仍渲染全部日志且筛选交互可用", () => {
    renderPage();
    expect(screen.getByText("retry timeout reached")).toBeTruthy();
    fireEvent.click(screen.getByTestId("level-chip-warn"));
    expect(screen.queryByText("retry timeout reached")).toBeNull();
  });
});
