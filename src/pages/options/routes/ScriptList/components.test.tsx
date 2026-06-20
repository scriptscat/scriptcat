import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, fireEvent } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { renderWithTooltip } from "@Tests/renderWithTooltip";
import { SCRIPT_TYPE_NORMAL, SCRIPT_TYPE_BACKGROUND } from "@App/app/repo/scripts";

// requestCheckUpdate 走后台消息，统一打桩；用 hoisted 以便在 vi.mock 工厂内引用
const { requestCheckUpdate, preloadUserConfig, preloadCloudScriptPlan } = vi.hoisted(() => ({
  requestCheckUpdate: vi.fn(),
  preloadUserConfig: vi.fn(() => Promise.resolve()),
  preloadCloudScriptPlan: vi.fn(() => Promise.resolve()),
}));
vi.mock("@App/pages/store/features/script", () => ({
  scriptClient: { requestCheckUpdate },
}));
vi.mock("./preload", () => ({ preloadUserConfig }));
vi.mock("@App/pages/components/CloudScriptPlan", () => ({ preloadCloudScriptPlan }));

import { FaviconDots, getScriptHomePage, getTagColor, ScriptRowActions, UpdateTimeCell } from "./components";

beforeEach(() => {
  initTestLanguage("zh-CN");
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("脚本主页链接解析 getScriptHomePage", () => {
  it("优先返回 homepage", () => {
    expect(getScriptHomePage({ homepage: ["https://a"], website: ["https://b"] })).toBe("https://a");
  });

  it("homepage 缺失时依次回退到 homepageurl/website/source/supporturl", () => {
    expect(getScriptHomePage({ homepageurl: ["https://hu"] })).toBe("https://hu");
    expect(getScriptHomePage({ website: ["https://w"] })).toBe("https://w");
    expect(getScriptHomePage({ source: ["https://src"] })).toBe("https://src");
    expect(getScriptHomePage({ supporturl: ["https://s"] })).toBe("https://s");
  });

  it("无任何主页字段时返回 undefined", () => {
    expect(getScriptHomePage({})).toBeUndefined();
    expect(getScriptHomePage(undefined)).toBeUndefined();
  });

  it("仅允许 http/https：异常协议（javascript:/data:/file:）被忽略", () => {
    expect(getScriptHomePage({ homepage: ["javascript:alert(1)"] })).toBeUndefined();
    expect(getScriptHomePage({ homepage: ["data:text/html,x"] })).toBeUndefined();
    expect(getScriptHomePage({ homepage: ["file:///etc/passwd"] })).toBeUndefined();
    // 首选项异常时回退到后续的安全链接
    expect(getScriptHomePage({ homepage: ["javascript:alert(1)"], website: ["https://safe"] })).toBe("https://safe");
  });
});

describe("FaviconDots 站点图标可点击元素", () => {
  it("可点击元素为语义化 button，点击安全 URL 打开新标签", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderWithTooltip(<FaviconDots favorites={[{ match: "a.com", website: "https://a.com", icon: "" }] as never} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(openSpy).toHaveBeenCalledWith("https://a.com", "_blank");
    openSpy.mockRestore();
  });

  it("异常协议 URL 不打开（避免 javascript: 注入）", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderWithTooltip(<FaviconDots favorites={[{ match: "x", website: "javascript:alert(1)", icon: "" }] as never} />);
    fireEvent.click(screen.getByRole("button"));
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});

describe("标签配色 getTagColor", () => {
  it("返回 --label-* 设计令牌类名，而非硬编码的调色板类（如 bg-green-50）", () => {
    const color = getTagColor("anything");
    expect(color.bg).toMatch(/^bg-label-(green|blue|purple|orange|rose|teal|amber|indigo)-bg$/);
    expect(color.text).toMatch(/^text-label-(green|blue|purple|orange|rose|teal|amber|indigo)-fg$/);
    // 不得再出现旧的字面调色板类或 dark: 变体
    expect(color.bg).not.toContain("dark:");
    expect(`${color.bg} ${color.text}`).not.toMatch(/-(50|700|300|900)/);
  });

  it("同名标签稳定映射到同一颜色（哈希确定性）", () => {
    expect(getTagColor("工具")).toEqual(getTagColor("工具"));
  });

  it("bg 与 fg 的 hue 名一致，成对取色", () => {
    const color = getTagColor("github");
    const bgHue = color.bg.match(/^bg-label-(\w+)-bg$/)![1];
    const fgHue = color.text.match(/^text-label-(\w+)-fg$/)![1];
    expect(bgHue).toBe(fgHue);
  });
});

describe("ScriptRowActions 行内操作（替代 ⋯ 更多菜单）", () => {
  const makeScript = (over: Record<string, unknown> = {}) =>
    ({
      uuid: "u1",
      name: "脚本A",
      metadata: {},
      type: SCRIPT_TYPE_NORMAL,
      ...over,
    }) as never;

  it("普通脚本始终显示『编辑』『删除』，且不渲染更多菜单按钮", () => {
    renderWithTooltip(
      <ScriptRowActions script={makeScript()} navigate={vi.fn()} onDelete={vi.fn()} onRunStop={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: t("edit") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("delete") })).toBeInTheDocument();
    // 不应再有「更多」菜单
    expect(screen.queryByRole("button", { name: t("more") })).toBeNull();
  });

  it("无主页/配置/云端时不显示对应按钮", () => {
    renderWithTooltip(
      <ScriptRowActions script={makeScript()} navigate={vi.fn()} onDelete={vi.fn()} onRunStop={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: t("script:homepage") })).toBeNull();
    expect(screen.queryByRole("button", { name: t("editor:user_config") })).toBeNull();
    expect(screen.queryByRole("button", { name: t("editor:upload_to_cloud") })).toBeNull();
  });

  it("含主页字段时显示主页按钮，点击打开新标签", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderWithTooltip(
      <ScriptRowActions
        script={makeScript({ metadata: { homepage: ["https://home"] } })}
        navigate={vi.fn()}
        onDelete={vi.fn()}
        onRunStop={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: t("script:homepage") }));
    expect(openSpy).toHaveBeenCalledWith("https://home", "_blank");
    openSpy.mockRestore();
  });

  it("含 config 时显示用户配置按钮，导航到 ?userConfig=", () => {
    const navigate = vi.fn();
    renderWithTooltip(
      <ScriptRowActions
        script={makeScript({ config: { group: {} } })}
        navigate={navigate}
        onDelete={vi.fn()}
        onRunStop={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: t("editor:user_config") }));
    expect(navigate).toHaveBeenCalledWith("/?userConfig=u1");
  });

  it("聚焦用户配置按钮时应预加载当前脚本值", () => {
    const script = makeScript({ config: { group: {} } });
    renderWithTooltip(<ScriptRowActions script={script} navigate={vi.fn()} onDelete={vi.fn()} onRunStop={vi.fn()} />);

    fireEvent.focus(screen.getByRole("button", { name: t("editor:user_config") }));

    expect(preloadUserConfig).toHaveBeenCalledWith(script);
  });

  it("含 cloudcat 时显示云端按钮，导航到 ?cloud=（而非 cloudSync）", () => {
    const navigate = vi.fn();
    renderWithTooltip(
      <ScriptRowActions
        script={makeScript({ metadata: { cloudcat: ["true"] } })}
        navigate={navigate}
        onDelete={vi.fn()}
        onRunStop={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: t("editor:upload_to_cloud") }));
    expect(navigate).toHaveBeenCalledWith("/?cloud=u1");
  });

  it("悬浮云端按钮时应预加载当前脚本的导出计划", () => {
    const script = makeScript({ metadata: { cloudcat: ["true"] } });
    renderWithTooltip(<ScriptRowActions script={script} navigate={vi.fn()} onDelete={vi.fn()} onRunStop={vi.fn()} />);

    fireEvent.pointerEnter(screen.getByRole("button", { name: t("editor:upload_to_cloud") }));

    expect(preloadCloudScriptPlan).toHaveBeenCalledWith(script);
  });

  it("后台脚本显示运行按钮（标签为「运行」而非进度提示），点击触发 onRunStop", () => {
    const onRunStop = vi.fn();
    const script = makeScript({ type: SCRIPT_TYPE_BACKGROUND });
    renderWithTooltip(<ScriptRowActions script={script} navigate={vi.fn()} onDelete={vi.fn()} onRunStop={onRunStop} />);
    fireEvent.click(screen.getByRole("button", { name: t("editor:run") }));
    expect(onRunStop).toHaveBeenCalledWith(script);
  });

  it("删除触发器为带 aria-haspopup 的真实按钮（Popconfirm 的 trigger 属性透传到 ActionButton 内层按钮）", () => {
    renderWithTooltip(
      <ScriptRowActions script={makeScript()} navigate={vi.fn()} onDelete={vi.fn()} onRunStop={vi.fn()} />
    );
    const trigger = screen.getByRole("button", { name: t("delete") });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("点击删除先弹出 Popconfirm 气泡确认，确认前不调用 onDelete", async () => {
    const onDelete = vi.fn();
    const script = makeScript();
    renderWithTooltip(<ScriptRowActions script={script} navigate={vi.fn()} onDelete={onDelete} onRunStop={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: t("delete") });
    fireEvent.click(trigger);

    // 气泡里展示含脚本名的确认文案，但尚未真正删除
    expect(await screen.findByText(t("script:confirm_delete_script_content", { name: "脚本A" }))).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("在 Popconfirm 中点击确认后才触发 onDelete", async () => {
    const onDelete = vi.fn();
    const script = makeScript();
    renderWithTooltip(<ScriptRowActions script={script} navigate={vi.fn()} onDelete={onDelete} onRunStop={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: t("delete") });
    fireEvent.click(trigger);
    await screen.findByText(t("script:confirm_delete_script_content", { name: "脚本A" }));

    // 气泡内确认按钮与触发按钮同名（删除），取非触发的那一个
    const confirmBtn = screen.getAllByRole("button", { name: t("delete") }).find((b) => b !== trigger)!;
    fireEvent.click(confirmBtn);
    expect(onDelete).toHaveBeenCalledWith(script);
  });

  it("在 Popconfirm 中点击取消不触发 onDelete", async () => {
    const onDelete = vi.fn();
    const script = makeScript();
    renderWithTooltip(<ScriptRowActions script={script} navigate={vi.fn()} onDelete={onDelete} onRunStop={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: t("delete") }));
    await screen.findByText(t("script:confirm_delete_script_content", { name: "脚本A" }));

    fireEvent.click(screen.getByRole("button", { name: t("editor:cancel") }));
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe("UpdateTimeCell 检查更新交互", () => {
  const makeScript = (over: Record<string, unknown> = {}) =>
    ({ uuid: "u1", updatetime: 1700000000000, checkUpdateUrl: "https://x/u.user.js", metadata: {}, ...over }) as never;

  it("默认就常驻显示『检查更新』按钮（不再 opacity-0 隐藏）", () => {
    renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    expect(screen.getByRole("button", { name: t("check_update") })).toBeInTheDocument();
  });

  it("无 checkUpdateUrl 时不显示检查更新按钮", () => {
    renderWithTooltip(<UpdateTimeCell script={makeScript({ checkUpdateUrl: undefined })} />);
    expect(screen.queryByRole("button", { name: t("check_update") })).toBeNull();
  });

  it("点击后调用 requestCheckUpdate", () => {
    requestCheckUpdate.mockReturnValue(new Promise(() => {}));
    renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    fireEvent.click(screen.getByRole("button", { name: t("check_update") }));
    expect(requestCheckUpdate).toHaveBeenCalledWith("u1");
  });

  it("检查到已是最新时内联提示『已是最新版本』", async () => {
    requestCheckUpdate.mockResolvedValue(false);
    renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    fireEvent.click(screen.getByRole("button", { name: t("check_update") }));
    expect(await screen.findByText(t("script:latest_version"))).toBeInTheDocument();
  });

  it("检查到新版本时显示『存在新版本』入口", async () => {
    requestCheckUpdate.mockResolvedValue(true);
    renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    fireEvent.click(screen.getByRole("button", { name: t("check_update") }));
    expect(await screen.findByText(t("script:new_version_available"))).toBeInTheDocument();
  });

  it("检查到新版本时『存在新版本』直接取代更新时间", async () => {
    requestCheckUpdate.mockResolvedValue(true);
    const { container } = renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    // 初始（idle）应显示相对时间
    expect(container.textContent?.trim()).not.toBe("");
    fireEvent.click(screen.getByRole("button", { name: t("check_update") }));
    await screen.findByText(t("script:new_version_available"));
    // 时间被入口取代：整格可见文本只剩「存在新版本」
    expect(container.textContent).toBe(t("script:new_version_available"));
  });

  it("『存在新版本』为内联文字样式：无胶囊背景且不会竖排换行", async () => {
    requestCheckUpdate.mockResolvedValue(true);
    renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    fireEvent.click(screen.getByRole("button", { name: t("check_update") }));
    const button = (await screen.findByText(t("script:new_version_available"))).closest("button")!;
    // 与「已是最新版本」一致的内联文字：不再用 rounded-full 胶囊背景
    expect(button.className).not.toContain("bg-primary/10");
    expect(button.className).not.toContain("rounded-full");
    // whitespace-nowrap 保证中文不会被窄槽位挤成一字一行
    expect(button).toHaveClass("whitespace-nowrap");
  });
});
