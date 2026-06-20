// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { t } from "@App/locales/locales";

// 警告区依赖 chrome.action / permissions，与本测试无关，置空以隔离
vi.mock("./PopupWarnings", () => ({ default: () => null }));

// 以 mock 形式注入 usePopupData，保留其余实导出（getVisibleMenuItems 等）
let mockData: any;
vi.mock("./usePopupData", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, usePopupData: () => mockData };
});

import App from "./App";

function makeData(overrides: Record<string, any> = {}) {
  return {
    loading: false,
    isBlacklist: false,
    host: "example.com",
    scriptList: [],
    backScriptList: [],
    allScripts: [],
    fullScriptCount: 0,
    fullBackScriptCount: 0,
    remainingCurrentCount: 0,
    remainingBackCount: 0,
    canExpandCurrent: false,
    canExpandBack: false,
    isCurrentExpanded: false,
    isBackExpanded: false,
    totalScriptCount: 0,
    backRunningCount: 0,
    enabledScriptCount: 0,
    enabledBackScriptCount: 0,
    errorMessage: "",
    showSearch: false,
    searchQuery: "",
    isEnableScript: true,
    checkUpdate: { notice: "", version: "0.0.0", isRead: true },
    checkUpdateStatus: 0,
    showAlert: false,
    menuExpandNum: 5,
    defaultScriptProvider: "scriptcat",
    currentUrl: "https://example.com",
    handleToggleScript: vi.fn(),
    handleDeleteScript: vi.fn(),
    handleOpenEditor: vi.fn(),
    handleOpenUserConfig: vi.fn(),
    handleExcludeUrl: vi.fn(),
    handleMenuClick: vi.fn(),
    handleRunScript: vi.fn(),
    handleStopScript: vi.fn(),
    handleCreateScript: vi.fn(),
    handleOpenSettings: vi.fn(),
    handleToggleEnableScript: vi.fn(),
    handleNotificationClick: vi.fn(),
    handleVersionClick: vi.fn(),
    handleMenuCheckUpdate: vi.fn(),
    handleGetMoreScript: vi.fn(),
    handleSearch: vi.fn(),
    handleToggleExpand: vi.fn(),
    ...overrides,
  };
}

const cls = (el: Element | null) => el?.getAttribute("class") || "";

// 构造一个最小可用的 ScriptMenu，便于在列表/快捷键测试中复用
function makeScriptMenu(overrides: Record<string, any> = {}) {
  return {
    uuid: "u1",
    name: "Script A",
    storageName: "",
    enable: true,
    updatetime: 0,
    hasUserConfig: false,
    icon: undefined,
    runStatus: undefined,
    runNum: 1,
    runNumByIframe: 0,
    menus: [],
    isEffective: null,
    ...overrides,
  };
}

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("Popup 页头品牌标识", () => {
  it("页头左上角应渲染真实 logo 图片", () => {
    mockData = makeData();
    render(<App />);
    const logo = screen.getByAltText("ScriptCat");
    expect(logo.tagName).toBe("IMG");
    expect(logo.getAttribute("src")).toContain("assets/logo.png");
  });
});

describe("Popup 脚本列表展开/收起", () => {
  it("当前页脚本超过展示上限且已展开时，应显示「收起」按钮并可再次折叠", () => {
    const handleToggleExpand = vi.fn();
    mockData = makeData({
      fullScriptCount: 17,
      canExpandCurrent: true,
      isCurrentExpanded: true,
      remainingCurrentCount: 0,
      handleToggleExpand,
    });

    render(<App />);

    const collapseBtn = screen.getByRole("button", { name: /收起/ });
    expect(collapseBtn).toBeInTheDocument();

    fireEvent.click(collapseBtn);
    expect(handleToggleExpand).toHaveBeenCalledWith("current");
  });

  it("当前页脚本未展开时显示「显示更多」按钮，且不显示「收起」", () => {
    mockData = makeData({
      fullScriptCount: 17,
      canExpandCurrent: true,
      isCurrentExpanded: false,
      remainingCurrentCount: 12,
    });

    render(<App />);

    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /收起/ })).not.toBeInTheDocument();
  });

  it("当前页脚本不超过上限时，不显示展开/收起按钮", () => {
    mockData = makeData({
      fullScriptCount: 3,
      canExpandCurrent: false,
      isCurrentExpanded: false,
      remainingCurrentCount: 0,
    });

    render(<App />);

    expect(screen.queryByRole("button", { name: /收起/ })).not.toBeInTheDocument();
  });
});

describe("Popup accessKey 菜单快捷键", () => {
  it("即使脚本未在展示列表中（被截断或搜索过滤），其菜单 accessKey 仍应触发", () => {
    const handleMenuClick = vi.fn();
    const menu = { key: "k1", name: "命令", groupKey: "g1", options: { accessKey: "k" } };
    const hiddenScript = makeScriptMenu({ uuid: "uuid-hidden", menus: [menu] });
    // 展示列表为空（脚本超过上限被截断 / 被搜索过滤），但 allScripts 含全部脚本
    mockData = makeData({
      scriptList: [],
      backScriptList: [],
      allScripts: [hiddenScript],
      handleMenuClick,
    });

    render(<App />);
    document.dispatchEvent(new KeyboardEvent("keypress", { key: "k" }));

    expect(handleMenuClick).toHaveBeenCalledWith("uuid-hidden", [menu]);
  });
});

describe("Popup GM 菜单项 tooltip", () => {
  it("菜单命令应将 options.title 作为按钮 title（tooltip）", () => {
    const menu = { key: "k1", name: "菜单命令", groupKey: "g1", options: { title: "这是提示" } };
    const script = makeScriptMenu({ uuid: "u1", menus: [menu] });
    mockData = makeData({
      scriptList: [script],
      allScripts: [script],
      fullScriptCount: 1,
      enabledScriptCount: 1,
    });

    render(<App />);

    const btn = screen.getByRole("button", { name: "菜单命令" });
    expect(btn).toHaveAttribute("title", "这是提示");
  });
});

describe("Popup 禁用脚本操作项样式", () => {
  it("禁用脚本的用户配置按钮应显示为 muted 颜色", () => {
    const script = makeScriptMenu({ uuid: "u1", enable: false, hasUserConfig: true });
    mockData = makeData({
      scriptList: [script],
      allScripts: [script],
      fullScriptCount: 1,
    });

    render(<App />);

    const btn = screen.getByRole("button", { name: "用户配置" });
    expect(cls(btn)).toMatch(/\btext-muted-foreground\b/);
  });
});

describe("Popup 输入型 GM 菜单（对齐 v1.4：菜单名按钮即提交）", () => {
  it("文本输入菜单：点击菜单名按钮以当前输入值提交", () => {
    const handleMenuClick = vi.fn();
    const menu = {
      key: "k1",
      name: "输入命令",
      groupKey: "g1",
      options: { inputType: "text", inputDefaultValue: "默认值" },
    };
    const script = makeScriptMenu({ uuid: "u1", menus: [menu] });
    mockData = makeData({
      scriptList: [script],
      allScripts: [script],
      fullScriptCount: 1,
      enabledScriptCount: 1,
      handleMenuClick,
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "输入命令" }));

    expect(handleMenuClick).toHaveBeenCalledWith("u1", [menu], "默认值");
  });

  it("布尔输入菜单：切换开关不立即提交，点击菜单名按钮才提交切换后的布尔值", () => {
    const handleMenuClick = vi.fn();
    const menu = {
      key: "k1",
      name: "开关命令",
      groupKey: "g1",
      options: { inputType: "boolean", inputDefaultValue: false },
    };
    const script = makeScriptMenu({ uuid: "u1", menus: [menu] });
    mockData = makeData({
      scriptList: [script],
      allScripts: [script],
      fullScriptCount: 1,
      enabledScriptCount: 1,
      handleMenuClick,
    });

    render(<App />);
    // 行内有「脚本启用开关」与「布尔菜单开关」，后者位于菜单区（DOM 中靠后）
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[switches.length - 1]);
    expect(handleMenuClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "开关命令" }));
    expect(handleMenuClick).toHaveBeenCalledTimes(1);
    expect(handleMenuClick).toHaveBeenCalledWith("u1", [menu], true);
  });
});

describe("Popup 移动端宽度适配 (#686 Edge Android)", () => {
  it("根容器使用响应式宽度 w-full（由 body 控制），而非写死 320px，以便移动端铺满消除右侧留白", () => {
    mockData = makeData({ fullScriptCount: 0 });

    const { container } = render(<App />);
    const root = container.firstElementChild as HTMLElement;

    expect(cls(root)).toMatch(/\bw-full\b/);
    expect(cls(root)).not.toMatch(/w-\[320px\]/);
  });

  it("popup.html 通过媒体查询在移动端（视口 ≥340px）将宽度切换为 100%", () => {
    const html = fs.readFileSync(path.join(process.cwd(), "src/pages/popup.html"), "utf8");
    // 桌面端 popup 视口恒为 320px、不命中；移动端被撑满（≥360px）命中后切换 100% 宽度
    expect(html).toMatch(/@media\s*\(min-width:\s*340px\)/);
    expect(html).toMatch(/width:\s*100%/);
  });
});

describe("Popup 页脚版本号可达性", () => {
  it("无新版本且检查状态空闲时，版本号是可键盘聚焦的按钮（非 span），点击触发检查更新", () => {
    const handleVersionClick = vi.fn();
    mockData = makeData({
      checkUpdate: { notice: "", version: "0.0.0", isRead: true },
      checkUpdateStatus: 0,
      handleVersionClick,
    });

    render(<App />);
    const btn = screen.getByRole("button", { name: /^v/ });
    expect(btn.tagName).toBe("BUTTON");
    expect(cls(btn)).toMatch(/focus-visible:ring-2/);

    fireEvent.click(btn);
    expect(handleVersionClick).toHaveBeenCalledTimes(1);
  });

  it("有新版本时，版本号渲染为按钮且带 focus ring", () => {
    mockData = makeData({
      checkUpdate: { notice: "", version: "99.0.0", isRead: true },
      checkUpdateStatus: 0,
    });

    render(<App />);
    const btn = screen.getByRole("button", { name: /^v/ });
    expect(btn.tagName).toBe("BUTTON");
    expect(cls(btn)).toMatch(/focus-visible:ring-2/);
  });

  it("已是最新版本时，版本号文案为按钮且可键盘聚焦", () => {
    const handleVersionClick = vi.fn();
    mockData = makeData({
      checkUpdate: { notice: "", version: "0.0.0", isRead: true },
      checkUpdateStatus: 2,
      handleVersionClick,
    });

    render(<App />);
    const btn = screen.getByRole("button", { name: t("script:latest_version") });
    expect(btn.tagName).toBe("BUTTON");
    expect(cls(btn)).toMatch(/focus-visible:ring-2/);

    fireEvent.click(btn);
    expect(handleVersionClick).toHaveBeenCalledTimes(1);
  });
});

describe("Popup 滚动区域（避免双滚动条）", () => {
  it("根容器受最大高度约束并裁剪溢出，仅脚本列表区可滚动", () => {
    mockData = makeData({ fullScriptCount: 0 });

    const { container } = render(<App />);
    const root = container.firstElementChild as HTMLElement;

    // 根容器需有最大高度约束并裁剪溢出，避免浏览器 popup 自身再出现一条滚动条
    expect(cls(root)).toMatch(/max-h-\[/);
    expect(cls(root)).toMatch(/overflow-hidden/);

    // 整个 popup 仅应有一个 overflow-auto 滚动区，且占据剩余空间（flex-1）
    const scrollers = Array.from(container.querySelectorAll("*")).filter((el) => /overflow-auto/.test(cls(el)));
    expect(scrollers).toHaveLength(1);
    expect(cls(scrollers[0])).toMatch(/flex-1/);
  });

  it("脚本列表滚动区应应用自定义滚动条样式（明暗主题由 CSS 变量自适应）", () => {
    mockData = makeData({ fullScriptCount: 0 });

    const { container } = render(<App />);
    const scrollers = Array.from(container.querySelectorAll("*")).filter((el) => /overflow-auto/.test(cls(el)));

    expect(scrollers).toHaveLength(1);
    expect(cls(scrollers[0])).toMatch(/scrollbar-custom/);
  });
});
