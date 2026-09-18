import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { t } from "@App/locales/locales";
import { ExtVersion } from "@App/app/const";

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
    pageStatus: "ok",
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
    popupCompactLayout: false,
    defaultScriptProvider: "scriptcat",
    currentUrl: "https://example.com",
    handleToggleScript: vi.fn(),
    handleDeleteScript: vi.fn(),
    handleOpenEditor: vi.fn(),
    handleOpenScriptSettings: vi.fn(),
    handleOpenUserConfig: vi.fn(),
    handleExcludeFromMatch: vi.fn(),
    handleOnlyRunOnUrl: vi.fn(),
    handleAllowUrl: vi.fn(),
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
    hasMatchOverride: false,
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

describe("Popup 更多菜单焦点行为", () => {
  it("Firefox 瞬时焦点移出时保持开启，Escape 和菜单项仍可关闭", async () => {
    const handleCreateScript = vi.fn();
    mockData = makeData({ handleCreateScript });
    render(<App />);

    const trigger = screen.getByRole("button", { name: t("more_menu") });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    await act(async () => {
      outside.focus();
    });
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(outside);
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: t("script:create_script") }));
    expect(handleCreateScript).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    trigger.focus();
    outside.remove();
  });
});

describe("Popup 紧凑布局", () => {
  it("启用后应缩小分组标题与脚本行间距", () => {
    const script = makeScriptMenu();
    mockData = makeData({
      popupCompactLayout: true,
      scriptList: [script],
      allScripts: [script],
      fullScriptCount: 1,
      enabledScriptCount: 1,
    });

    render(<App />);

    expect(screen.getByText(new RegExp(t("popup:current_page_scripts"))).closest("button")).toHaveClass("h-8", "px-3");
    expect(screen.getByText("Script A").closest("button")?.parentElement).toHaveClass("h-9", "px-3", "gap-2");
  });
});

describe("Popup 当前页状态提示（脚本猫触及不到的页面）", () => {
  it.each([
    ["restricted", "浏览器不允许扩展在此页面运行脚本"],
    ["blacklist", "当前页面在黑名单中，无法使用脚本"],
    ["file-access-denied", "要在本地文件上运行脚本，请在扩展详情页开启「允许访问文件网址」"],
    ["not-injected", "脚本尚未在此页面运行，刷新页面后生效"],
    ["scripts-disabled", "脚本已全局关闭，开启上方开关并刷新页面后生效"],
    ["userscripts-unavailable", "浏览器的用户脚本功能未启用，脚本无法在此页面运行"],
  ])("pageStatus=%s 时说明本页不运行脚本的原因", (pageStatus, message) => {
    mockData = makeData({ pageStatus, scriptList: [], fullScriptCount: 0 });
    render(<App />);

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("pageStatus=ok 时不显示任何状态提示", () => {
    mockData = makeData({ scriptList: [makeScriptMenu()], fullScriptCount: 1 });
    render(<App />);

    expect(screen.queryByText(/浏览器不允许|黑名单|允许访问文件网址|刷新页面后生效/)).not.toBeInTheDocument();
  });
});

describe("Popup 脚本快捷设置与站点范围操作", () => {
  it("S1 全局生效时显示带确认的仅运行在与互斥排除", async () => {
    const handleOnlyRunOnUrl = vi.fn();
    const handleExcludeFromMatch = vi.fn();
    mockData = makeData({
      scriptList: [makeScriptMenu({ isEffective: true, hasMatchOverride: false })],
      fullScriptCount: 1,
      handleOnlyRunOnUrl,
      handleExcludeFromMatch,
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Script A/ }));

    const onlyButton = screen.getByRole("button", { name: "仅在 example.com 执行" });
    expect(onlyButton).toHaveClass("text-primary");
    expect(screen.getByRole("button", { name: "排除在 example.com 上执行" })).toHaveClass("text-type-orange");

    fireEvent.click(onlyButton);
    expect(handleOnlyRunOnUrl).not.toHaveBeenCalled();
    expect(await screen.findByText("将清空脚本原有的网站匹配规则，确认仅在此网站运行？")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("popconfirm-confirm"));
    expect(handleOnlyRunOnUrl).toHaveBeenCalledWith("u1");

    fireEvent.click(screen.getByRole("button", { name: "排除在 example.com 上执行" }));
    expect(handleExcludeFromMatch).toHaveBeenCalledWith("u1");
  });

  it("S3 已包含时只显示排除并调用匹配覆盖操作", () => {
    const handleExcludeFromMatch = vi.fn();
    mockData = makeData({
      scriptList: [makeScriptMenu({ isEffective: true, hasMatchOverride: true })],
      fullScriptCount: 1,
      handleExcludeFromMatch,
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Script A/ }));

    expect(screen.queryByRole("button", { name: "仅在 example.com 执行" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "允许在 example.com 执行" })).not.toBeInTheDocument();
    const excludeButton = screen.getByRole("button", { name: "排除在 example.com 上执行" });
    expect(excludeButton).toHaveClass("text-type-orange");
    fireEvent.click(excludeButton);
    expect(handleExcludeFromMatch).toHaveBeenCalledWith("u1");
  });

  it.each([false, true])("S2/S4 本站不生效时只显示包含动作（hasMatchOverride=%s）", (hasMatchOverride) => {
    const handleAllowUrl = vi.fn();
    mockData = makeData({
      scriptList: [makeScriptMenu({ isEffective: false, hasMatchOverride })],
      fullScriptCount: 1,
      handleAllowUrl,
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Script A/ }));

    const allowButton = screen.getByRole("button", { name: "允许在 example.com 执行" });
    expect(allowButton).toHaveClass("text-primary");
    expect(screen.queryByRole("button", { name: "仅在 example.com 执行" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "排除在 example.com 上执行" })).not.toBeInTheDocument();
    fireEvent.click(allowButton);
    expect(handleAllowUrl).toHaveBeenCalledWith("u1");
  });

  it("只匹配到 iframe 的脚本隐藏站点范围动作（规则按顶层 host 生成，对它不成立）", () => {
    mockData = makeData({
      scriptList: [makeScriptMenu({ isEffective: true, hasMatchOverride: false, matchesTopFrame: false })],
      fullScriptCount: 1,
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Script A/ }));

    expect(screen.getByRole("button", { name: "脚本设置" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "仅在 example.com 执行" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "允许在 example.com 执行" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "排除在 example.com 上执行" })).not.toBeInTheDocument();
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

    const collapseBtn = screen.getByText(/收起/).closest("button")!;
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
    expect(screen.queryByText(/收起/)).not.toBeInTheDocument();
  });

  it("当前页脚本不超过上限时，不显示展开/收起按钮", () => {
    mockData = makeData({
      fullScriptCount: 3,
      canExpandCurrent: false,
      isCurrentExpanded: false,
      remainingCurrentCount: 0,
    });

    render(<App />);

    expect(screen.queryByText(/收起/)).not.toBeInTheDocument();
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

  it("当焦点在输入框（input/textarea/可编辑元素）中时，快捷键不应触发菜单（避免打字误触）", () => {
    const handleMenuClick = vi.fn();
    const menu = { key: "k1", name: "命令", groupKey: "g1", options: { accessKey: "k" } };
    const script = makeScriptMenu({ uuid: "u1", menus: [menu] });
    mockData = makeData({
      scriptList: [script],
      allScripts: [script],
      handleMenuClick,
    });

    render(<App />);

    // 模拟用户在输入框中打字：事件源是 input
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keypress", { key: "k", bubbles: true }));
    expect(handleMenuClick).not.toHaveBeenCalled();

    // 对照：焦点不在输入框时（事件源为 document.body）仍正常触发
    document.body.dispatchEvent(new KeyboardEvent("keypress", { key: "k", bubbles: true }));
    expect(handleMenuClick).toHaveBeenCalledWith("u1", [menu]);

    input.remove();
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

    const btn = screen.getByText("菜单命令").closest("button")!;
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

    const btn = screen.getByText("用户配置").closest("button")!;
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
    fireEvent.click(screen.getByText("输入命令").closest("button")!);

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
    const switches = document.querySelectorAll<HTMLElement>('[role="switch"]');
    fireEvent.click(switches[switches.length - 1]);
    expect(handleMenuClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("开关命令").closest("button")!);
    expect(handleMenuClick).toHaveBeenCalledTimes(1);
    expect(handleMenuClick).toHaveBeenCalledWith("u1", [menu], true);
  });
});

describe("Popup 菜单展开数量为 0 时的菜单位置", () => {
  const menu = { key: "k1", name: "菜单命令", groupKey: "g1" };

  function buttonTexts() {
    return Array.from(document.querySelectorAll("button")).map((b) => b.textContent || "");
  }

  it("菜单展开数量为 0：展开脚本后，菜单排在「编辑」「脚本设置」之前", () => {
    const script = makeScriptMenu({ uuid: "u1", menus: [menu] });
    mockData = makeData({
      scriptList: [script],
      allScripts: [script],
      fullScriptCount: 1,
      enabledScriptCount: 1,
      menuExpandNum: 0,
    });

    render(<App />);
    // 未展开时不显示菜单
    expect(screen.queryByText("菜单命令")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Script A").closest("button")!);

    const texts = buttonTexts();
    const menuIndex = texts.findIndex((s) => s.includes("菜单命令"));
    const editIndex = texts.findIndex((s) => s.includes(t("edit")));
    const settingIndex = texts.findIndex((s) => s.includes(t("editor:script_setting")));
    expect(menuIndex).toBeGreaterThanOrEqual(0);
    expect(menuIndex).toBeLessThan(editIndex);
    expect(menuIndex).toBeLessThan(settingIndex);
  });

  it("菜单展开数量大于 0：菜单仍常驻在折叠区之外，位于「编辑」「脚本设置」之后", () => {
    const script = makeScriptMenu({ uuid: "u1", menus: [menu] });
    mockData = makeData({
      scriptList: [script],
      allScripts: [script],
      fullScriptCount: 1,
      enabledScriptCount: 1,
      menuExpandNum: 5,
    });

    render(<App />);
    expect(screen.getByText("菜单命令")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Script A").closest("button")!);

    const texts = buttonTexts();
    const menuIndex = texts.findIndex((s) => s.includes("菜单命令"));
    const settingIndex = texts.findIndex((s) => s.includes(t("editor:script_setting")));
    expect(settingIndex).toBeGreaterThanOrEqual(0);
    expect(menuIndex).toBeGreaterThan(settingIndex);
  });

  it("负数菜单展开数量：保留原有行为显示全部菜单", () => {
    const menus = [
      { key: "k1", name: "菜单命令 1", groupKey: "g1" },
      { key: "k2", name: "菜单命令 2", groupKey: "g2" },
    ];
    const script = makeScriptMenu({ uuid: "u1", menus });
    mockData = makeData({
      scriptList: [script],
      allScripts: [script],
      fullScriptCount: 1,
      enabledScriptCount: 1,
      menuExpandNum: -1,
    });

    render(<App />);

    expect(screen.getByText("菜单命令 1")).toBeInTheDocument();
    expect(screen.getByText("菜单命令 2")).toBeInTheDocument();
  });
});

describe("Popup 移动端宽度适配 (#686 Edge Android)", () => {
  it("popup.html 通过媒体查询在移动端（视口 >360px）将宽度切换为 100%", () => {
    const html = fs.readFileSync(path.join(process.cwd(), "src/pages/popup.html"), "utf8");
    // 桌面端 popup 视口恒为 360px、不命中；移动端被撑满（>360px）命中后切换 100% 宽度
    expect(html).toMatch(/width:\s*360px/);
    expect(html).toMatch(/@media\s*\(min-width:\s*365px\)/);
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
    const btn = screen.getByText(/^v/).closest("button")!;
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
    const btn = screen.getByText(/^v/).closest("button")!;
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
    const btn = screen.getByText(t("script:latest_version")).closest("button")!;
    expect(btn.tagName).toBe("BUTTON");
    expect(cls(btn)).toMatch(/focus-visible:ring-2/);

    fireEvent.click(btn);
    expect(handleVersionClick).toHaveBeenCalledTimes(1);
  });
});

describe("Popup 反馈问题链接", () => {
  async function openFeedback(userAgent: string, highEntropy?: Record<string, unknown>) {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const uaSpy = vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
    if (highEntropy) {
      Object.defineProperty(navigator, "userAgentData", {
        value: { getHighEntropyValues: () => Promise.resolve(highEntropy) },
        configurable: true,
      });
    }
    mockData = makeData();
    // client hints 是挂载后异步取的，要等这次微任务落地才反映到链接上
    await act(async () => {
      render(<App />);
    });

    const trigger = screen.getByRole("button", { name: t("more_menu") });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: t("report_issue") }));

    const href = open.mock.calls[0][0] as string;
    open.mockRestore();
    uaSpy.mockRestore();
    if (highEntropy) Reflect.deleteProperty(navigator, "userAgentData");
    return new URL(href);
  }

  const CHROME_MAC =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

  it("落到模板选择页，而不是替用户选定某个模板", async () => {
    const url = await openFeedback(CHROME_MAC);

    expect(url.origin + url.pathname).toBe("https://github.com/scriptscat/scriptcat/issues/new/choose");
    // 不再按界面语言分叉到 01_bug_report / 11_bug_report_en：模板由用户在 choose 页自己挑
    expect(url.searchParams.get("template")).toBeNull();
    expect(url.search).not.toMatch(/bug_report/);
  });

  it("带上模板能认的参数名，且 browser 是人话而不是整条 UA", async () => {
    const url = await openFeedback(CHROME_MAC);

    // 参数名必须与 .github/ISSUE_TEMPLATE 里的字段 id 一致，对不上 GitHub 会静默丢弃
    expect(url.searchParams.get("scriptcat-version")).toBe(ExtVersion);
    expect(url.searchParams.get("browser")).toBe("macOS + Chrome 143");
  });

  it("认不出的 UA 原样带上，不丢信息", async () => {
    const url = await openFeedback("SomeBrandNewAgent/1.0");

    expect(url.searchParams.get("browser")).toBe("SomeBrandNewAgent/1.0");
  });

  it("能拿到 client hints 时补出真实系统版本、构建号与架构", async () => {
    // Chromium 的 UA 被 UA reduction 冻结，这些细节只有 client hints 有
    const url = await openFeedback(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      {
        platform: "Windows",
        platformVersion: "15.0.0",
        fullVersionList: [
          { brand: "Not(A:Brand", version: "99.0.0.0" },
          { brand: "Google Chrome", version: "143.0.7499.96" },
        ],
        architecture: "arm",
        bitness: "64",
      }
    );

    expect(url.searchParams.get("browser")).toBe("Windows 11 + Chrome 143.0.7499.96 (arm64)");
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
