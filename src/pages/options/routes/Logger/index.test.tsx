import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage, t } from "@App/locales/locales";
import type { Logger as LoggerEntry } from "@App/app/repo/logger";

// 数据 Hook 涉及 IndexedDB 读取，测试中整体打桩；返回稳定引用避免无限重渲染。
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
// 桌面视图用例:固定为非移动端(移动端重壳另在 LoggerMobile.test.tsx 覆盖)
vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: () => false, MOBILE_BREAKPOINT: 768 }));

import Logger from "./index";

const renderPage = () => render(<Logger />, { wrapper: MemoryRouter });

beforeEach(() => {
  initLanguage("zh-CN");
  mockLoggerData.logs = sampleLogs;
  mockLoggerData.clearLogs = vi.fn(() => Promise.resolve());
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe("日志页面", () => {
  it("渲染传入的全部日志消息", () => {
    renderPage();
    expect(screen.getByText("GM_xhr connect failed")).toBeTruthy();
    expect(screen.getByText("retry timeout reached")).toBeTruthy();
    expect(screen.getByText("userscript started ok")).toBeTruthy();
  });

  it("关闭某个级别筛选 chip 后隐藏该级别日志", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("level-chip-warn"));
    expect(screen.queryByText("retry timeout reached")).toBeNull();
    expect(screen.getByText("GM_xhr connect failed")).toBeTruthy();
    expect(screen.getByText("userscript started ok")).toBeTruthy();
  });

  it("点击日志行可展开查看完整标签", () => {
    renderPage();
    expect(screen.queryByTestId("log-detail-1")).toBeNull();
    fireEvent.click(screen.getByTestId("log-row-1"));
    expect(screen.getByTestId("log-detail-1")).toBeTruthy();
  });

  it("点击清空日志先弹出确认，确认前不调用 clearLogs", async () => {
    renderPage();
    expect(mockLoggerData.clearLogs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t("logs:clear_logs") }));
    expect(await screen.findByText(t("logs:clear_logs_confirm"))).toBeTruthy();
    expect(mockLoggerData.clearLogs).not.toHaveBeenCalled();
  });
});
