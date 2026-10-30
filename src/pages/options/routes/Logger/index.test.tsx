import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { Logger as LoggerEntry } from "@App/app/repo/logger";
import { notify } from "@App/pages/components/ui/toast";
import { formatLogLine, formatLogsJson, formatLogsText } from "./logic";

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
// 桌面与移动端用例放在同一文件:ui 项目 isolate:false 下两个文件各自 mock 同一个 ./index 的依赖会互相串用
vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: vi.fn(), MOBILE_BREAKPOINT: 768 }));

import { useIsMobile } from "@App/pages/components/use-is-mobile";
import Logger from "./index";

const mockedUseIsMobile = vi.mocked(useIsMobile);

const renderPage = () => render(<Logger />, { wrapper: MemoryRouter });

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  mockLoggerData.logs = sampleLogs;
  mockLoggerData.clearLogs = vi.fn(() => Promise.resolve());
  vi.clearAllMocks();
  mockedUseIsMobile.mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mockClipboard = (writeText: (text: string) => Promise<void>) => {
  const fn = vi.fn(writeText);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: fn }, configurable: true });
  return fn;
};

const openExportMenu = () => {
  const trigger = screen.getByRole("button", { name: t("export") });
  fireEvent.pointerDown(trigger, { button: 0 });
  fireEvent.click(trigger);
};

// 捕获交给 chrome.downloads 的文件名与 Blob 内容
const captureDownload = () => {
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:logs");
  const download = vi.spyOn(chrome.downloads, "download").mockResolvedValue(undefined);
  return {
    download,
    blobText: () => (createObjectURL.mock.calls[0][0] as Blob).text(),
  };
};

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

  it("范围/统计条允许换行，窄桌面宽度下自动清理设置整行下移而非被统计文字压字", () => {
    renderPage();
    const bar = screen.getByTestId("logger-stats-bar");
    // 统计文字是 shrink-0,单行放不下时必然溢出压到相邻分组上(768~900px 带「实时」徽标即命中),
    // 允许换行才能让自动清理分组整行下移
    expect(bar.className).toContain("md:flex-wrap");
  });

  it("点击清空日志先弹出确认，确认前不调用 clearLogs", async () => {
    renderPage();
    expect(mockLoggerData.clearLogs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(t("logs:clear_logs")).closest("button")!);
    expect(await screen.findByText(t("logs:clear_logs_confirm"))).toBeTruthy();
    expect(mockLoggerData.clearLogs).not.toHaveBeenCalled();
  });

  it("日志消息文字不在按钮内，可以被拖选复制", () => {
    renderPage();
    expect(screen.getByText("GM_xhr connect failed").closest("button")).toBeNull();
  });

  it("拖选文字后松开鼠标不会展开该行", () => {
    vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "connect failed" } as Selection);
    renderPage();
    fireEvent.click(screen.getByTestId("log-row-1"));
    expect(screen.queryByTestId("log-detail-1")).toBeNull();
  });

  it("点击行内复制按钮把该条日志的文本行写入剪贴板，且不展开该行", async () => {
    const writeText = mockClipboard(() => Promise.resolve());
    renderPage();
    await act(async () => fireEvent.click(screen.getByTestId("log-copy-1")));
    expect(writeText).toHaveBeenCalledWith(formatLogLine(sampleLogs[0]));
    expect(notify.success).toHaveBeenCalledWith(t("logs:copied_logs", { count: 1 }));
    expect(screen.queryByTestId("log-detail-1")).toBeNull();
  });

  it("导出菜单「复制为文本」复制的是当前筛选结果", async () => {
    const writeText = mockClipboard(() => Promise.resolve());
    renderPage();
    fireEvent.click(screen.getByTestId("level-chip-warn"));
    openExportMenu();
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: t("logs:export_copy_text") })));
    expect(writeText).toHaveBeenCalledWith(formatLogsText([sampleLogs[0], sampleLogs[2]]));
    expect(notify.success).toHaveBeenCalledWith(t("logs:copied_logs", { count: 2 }));
  });

  it("写入剪贴板失败时提示错误而不是提示成功", async () => {
    mockClipboard(() => Promise.reject(new Error("denied")));
    renderPage();
    openExportMenu();
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: t("logs:export_copy_text") })));
    expect(notify.error).toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("导出 .log 文件下载当前筛选结果的纯文本", async () => {
    const { download, blobText } = captureDownload();
    renderPage();
    openExportMenu();
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: t("logs:export_download_log") })));
    expect(download).toHaveBeenCalledWith(
      expect.objectContaining({ saveAs: true, filename: expect.stringMatching(/^scriptcat-logs-\d{8}-\d{6}\.log$/) })
    );
    await expect(blobText()).resolves.toBe(formatLogsText(sampleLogs));
  });

  it("导出 .json 文件下载当前筛选结果的完整字段", async () => {
    const { download, blobText } = captureDownload();
    renderPage();
    openExportMenu();
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: t("logs:export_download_json") })));
    expect(download).toHaveBeenCalledWith(
      expect.objectContaining({ saveAs: true, filename: expect.stringMatching(/^scriptcat-logs-\d{8}-\d{6}\.json$/) })
    );
    await expect(blobText()).resolves.toBe(formatLogsJson(sampleLogs));
  });

  it("下载失败时提示错误", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:logs");
    vi.spyOn(chrome.downloads, "download").mockRejectedValue(new Error("download blocked"));
    renderPage();
    openExportMenu();
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: t("logs:export_download_log") })));
    expect(notify.error).toHaveBeenCalledWith(expect.stringContaining("download blocked"));
  });

  it("筛选结果为空时导出按钮不可用", () => {
    mockLoggerData.logs = [];
    renderPage();
    expect(screen.getByRole("button", { name: t("export") })).toBeDisabled();
  });
});

describe("日志页面 - 移动端", () => {
  beforeEach(() => mockedUseIsMobile.mockReturnValue(true));

  it("移动端顶栏的删除/清空按钮以图标按钮呈现(带无障碍名,不显示文字标签)", () => {
    renderPage();
    const del = screen.getByLabelText(t("logs:delete_current_logs"));
    const clear = screen.getByLabelText(t("logs:clear_logs"));
    // 图标按钮:可见文本里不再包含完整中文标签
    expect(del.textContent).not.toContain(t("logs:delete_current_logs"));
    expect(clear.textContent).not.toContain(t("logs:clear_logs"));
  });

  it("移动端日志行的消息允许换行而非截断", () => {
    renderPage();
    const msg = screen.getByText("GM_xhr connect failed");
    expect(msg.className).not.toContain("truncate");
  });

  it("移动端范围/统计条竖向堆叠，统计与自动清理各自独占整行", () => {
    renderPage();
    const bar = screen.getByTestId("logger-stats-bar");
    expect(bar.className).toContain("flex-col");
    // 两组必须撑满整行:否则长文本会溢出自身盒子压到相邻分组上(窄屏文字重叠)
    expect(screen.getByTestId("logger-stats-summary").className).toContain("w-full");
    expect(screen.getByTestId("logger-clean-schedule").className).toContain("w-full");
  });

  it("仍渲染全部日志且筛选交互可用", () => {
    renderPage();
    expect(screen.getByText("retry timeout reached")).toBeTruthy();
    fireEvent.click(screen.getByTestId("level-chip-warn"));
    expect(screen.queryByText("retry timeout reached")).toBeNull();
  });
});
