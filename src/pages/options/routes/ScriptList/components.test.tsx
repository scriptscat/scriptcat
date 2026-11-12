import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { renderWithTooltip } from "@Tests/renderWithTooltip";
import { TooltipProvider } from "@App/pages/components/ui/tooltip";
import { SCRIPT_TYPE_NORMAL, SCRIPT_TYPE_BACKGROUND, SCRIPT_TYPE_CRONTAB } from "@App/app/repo/scripts";
import type { ScriptLoading } from "@App/pages/store/features/script";

// requestCheckUpdate 走后台消息，统一打桩；用 hoisted 以便在 vi.mock 工厂内引用
const { requestCheckUpdate, exportScripts, preloadUserConfig, preloadCloudScriptPlan, get } = vi.hoisted(() => ({
  requestCheckUpdate: vi.fn(),
  exportScripts: vi.fn(() => Promise.resolve()),
  preloadUserConfig: vi.fn(() => Promise.resolve()),
  preloadCloudScriptPlan: vi.fn(() => Promise.resolve()),
  get: vi.fn(),
}));
vi.mock("@App/pages/store/features/script", () => ({
  scriptClient: { requestCheckUpdate },
  synchronizeClient: { export: exportScripts },
}));
vi.mock("./preload", () => ({ preloadUserConfig }));
const { notify } = vi.hoisted(() => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), loading: vi.fn() },
}));
vi.mock("@App/pages/components/ui/toast", () => ({ notify }));
vi.mock("@App/pages/components/CloudScriptPlan", () => ({ preloadCloudScriptPlan }));
vi.mock("@App/pkg/utils/cron", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, nextTimeDisplay: vi.fn(() => "2026-06-25 08:00:00") };
});
// useSystemConfig("trash_enabled") 读的是这个 store；默认给回收站「开启」，
// 关闭态相关用例（见「宽窄两套排布」里的删除用例）再各自切到 false。
vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({
    systemConfig: { get, getLanguage: vi.fn().mockResolvedValue("zh-CN"), set: vi.fn() },
  });
});

import {
  FaviconDots,
  getScriptHomePage,
  getScriptSupportUrl,
  getTagColor,
  ScheduleNextRun,
  ScriptListEmpty,
  ScriptRowActionSlots,
  scriptTypeLabel,
  UpdateTimeCell,
} from "./components";

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? true : 30));
});
afterEach(cleanup);

describe("脚本主页链接解析 getScriptHomePage", () => {
  it("优先返回 homepage", () => {
    expect(getScriptHomePage({ homepage: ["https://a"], website: ["https://b"] })).toBe("https://a");
  });

  it("homepage 缺失时依次回退到 homepageurl/website/source", () => {
    expect(getScriptHomePage({ homepageurl: ["https://hu"] })).toBe("https://hu");
    expect(getScriptHomePage({ website: ["https://w"] })).toBe("https://w");
    expect(getScriptHomePage({ source: ["https://src"] })).toBe("https://src");
  });

  it("supportURL/support 指向问题反馈页，不当作主页", () => {
    expect(getScriptHomePage({ supporturl: ["https://s"] })).toBeUndefined();
    expect(getScriptHomePage({ support: ["https://s"] })).toBeUndefined();
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

describe("脚本反馈链接解析 getScriptSupportUrl", () => {
  it("优先返回 supportURL，缺失时回退到同义的 @support", () => {
    expect(getScriptSupportUrl({ supporturl: ["https://a"], support: ["https://b"] })).toBe("https://a");
    expect(getScriptSupportUrl({ support: ["https://b"] })).toBe("https://b");
  });

  it("主页类字段不算反馈链接", () => {
    expect(getScriptSupportUrl({ homepage: ["https://h"], website: ["https://w"] })).toBeUndefined();
    expect(getScriptSupportUrl(undefined)).toBeUndefined();
  });

  it("仅允许 http/https：异常协议被忽略并继续回退", () => {
    expect(getScriptSupportUrl({ supporturl: ["javascript:alert(1)"] })).toBeUndefined();
    expect(getScriptSupportUrl({ supporturl: ["javascript:alert(1)"], support: ["https://safe"] })).toBe(
      "https://safe"
    );
  });
});

describe("FaviconDots 站点图标可点击元素", () => {
  it("可点击元素为语义化 button，点击安全 URL 打开新标签", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderWithTooltip(<FaviconDots favorites={[{ match: "a.com", website: "https://a.com", icon: "" }] as never} />);
    const btn = document.querySelector("button")!;
    fireEvent.click(btn);
    expect(openSpy).toHaveBeenCalledWith("https://a.com", "_blank");
    openSpy.mockRestore();
  });

  it("异常协议 URL 不打开（避免 javascript: 注入）", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderWithTooltip(<FaviconDots favorites={[{ match: "x", website: "javascript:alert(1)", icon: "" }] as never} />);
    fireEvent.click(document.querySelector("button")!);
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

describe("ScriptRowActionSlots 宽窄两套排布", () => {
  const makeScript = (over: Record<string, unknown> = {}) =>
    ({
      uuid: "u1",
      name: "脚本A",
      metadata: {},
      type: SCRIPT_TYPE_NORMAL,
      ...over,
    }) as never;

  const renderSlots = (
    over: Record<string, unknown> = {},
    handlers: Partial<{
      navigate: (to: string) => void;
      onDelete: (script: ScriptLoading) => void;
      onRunStop: (script: ScriptLoading) => void;
    }> = {}
  ) => {
    const script = makeScript(over);
    const navigate = handlers.navigate ?? vi.fn();
    const onDelete = handlers.onDelete ?? vi.fn();
    const onRunStop = handlers.onRunStop ?? vi.fn();
    renderWithTooltip(
      <ScriptRowActionSlots script={script} navigate={navigate} onDelete={onDelete} onRunStop={onRunStop} />
    );
    return { script, navigate, onDelete, onRunStop };
  };

  // Radix 下拉需要 pointerDown 才会展开（同 FilterBar.test.tsx 的既有写法）
  const openMore = () => {
    const trigger = within(screen.getByTestId("row-actions-compact")).getByLabelText(t("script:more_actions"));
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
  };

  const wide = () => within(screen.getByTestId("row-actions-wide"));
  const compact = () => within(screen.getByTestId("row-actions-compact"));

  it("宽排布把编辑、导出、删除摊成常驻按钮，不出现更多菜单", () => {
    const { navigate } = renderSlots();

    expect(wide().getByLabelText(t("edit"))).toBeInTheDocument();
    expect(wide().getByLabelText(t("export"))).toBeInTheDocument();
    expect(wide().getByLabelText(t("delete"))).toBeInTheDocument();
    expect(wide().queryByLabelText(t("script:more_actions"))).toBeNull();

    fireEvent.click(wide().getByLabelText(t("edit")));
    expect(navigate).toHaveBeenCalledWith("/script/editor/u1");
  });

  it("窄排布只留运行槽与更多按钮，普通脚本的运行槽是等宽占位", () => {
    renderSlots();

    expect(compact().getByLabelText(t("script:more_actions"))).toBeInTheDocument();
    expect(compact().queryByLabelText(t("edit"))).toBeNull();
    expect(compact().queryByLabelText(t("editor:run"))).toBeNull();
  });

  it("窄排布的更多菜单里有编辑，点击导航到编辑器", () => {
    const { navigate } = renderSlots();
    openMore();

    fireEvent.click(screen.getByText(t("edit")));

    expect(navigate).toHaveBeenCalledWith("/script/editor/u1");
  });

  it("无主页/反馈/配置/云端时更多菜单里不出现对应项", () => {
    renderSlots();
    openMore();

    expect(screen.queryByText(t("script:homepage"))).toBeNull();
    expect(screen.queryByText(t("script:support"))).toBeNull();
    expect(screen.queryByText(t("editor:user_config"))).toBeNull();
    expect(screen.queryByText(t("editor:upload_to_cloud"))).toBeNull();
  });

  it("含主页字段时菜单出现主页项，点击打开新标签", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderSlots({ metadata: { homepage: ["https://home"] } });
    openMore();

    fireEvent.click(screen.getByText(t("script:homepage")));

    expect(openSpy).toHaveBeenCalledWith("https://home", "_blank");
    openSpy.mockRestore();
  });

  it("含反馈链接时宽排布出现反馈按钮，点击打开新标签", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderSlots({ metadata: { support: ["https://support"] } });

    fireEvent.click(wide().getByLabelText(t("script:support")));

    expect(openSpy).toHaveBeenCalledWith("https://support", "_blank");
    openSpy.mockRestore();
  });

  it("含反馈链接时更多菜单出现反馈项，点击打开新标签", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderSlots({ metadata: { supporturl: ["https://support"] } });
    openMore();

    fireEvent.click(screen.getByText(t("script:support")));

    expect(openSpy).toHaveBeenCalledWith("https://support", "_blank");
    openSpy.mockRestore();
  });

  it("含 config 时菜单出现用户配置项，导航到 ?userConfig=", () => {
    const { navigate } = renderSlots({ config: { group: {} } });
    openMore();

    fireEvent.click(screen.getByText(t("editor:user_config")));

    expect(navigate).toHaveBeenCalledWith("/?userConfig=u1");
  });

  it("指针移到用户配置项时预加载当前脚本值", () => {
    const { script } = renderSlots({ config: { group: {} } });
    openMore();

    fireEvent.pointerEnter(screen.getByText(t("editor:user_config")));

    expect(preloadUserConfig).toHaveBeenCalledWith(script);
  });

  it("含 cloudcat 时菜单出现云端项，导航到 ?cloud=（而非 cloudSync）", () => {
    const { navigate } = renderSlots({ metadata: { cloudcat: ["true"] } });
    openMore();

    fireEvent.click(screen.getByText(t("editor:upload_to_cloud")));

    expect(navigate).toHaveBeenCalledWith("/?cloud=u1");
  });

  it("指针移到云端项时预加载当前脚本的导出计划", () => {
    const { script } = renderSlots({ metadata: { cloudcat: ["true"] } });
    openMore();

    fireEvent.pointerEnter(screen.getByText(t("editor:upload_to_cloud")));

    expect(preloadCloudScriptPlan).toHaveBeenCalledWith(script);
  });

  it("后台脚本的运行槽渲染为真实按钮，点击触发 onRunStop", () => {
    const onRunStop = vi.fn();
    const { script } = renderSlots({ type: SCRIPT_TYPE_BACKGROUND }, { onRunStop });

    fireEvent.click(compact().getByLabelText(t("editor:run")));

    expect(onRunStop).toHaveBeenCalledWith(script);
  });

  // trash_enabled 经 store 异步读取，点击前先等它落地
  const flushConfig = () => act(async () => {});
  const trashOff = () => get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? false : 30));

  it("回收站开启时，点击删除直接触发 onDelete，不弹确认框（由撤销 toast 兜底）", async () => {
    const onDelete = vi.fn();
    const { script } = renderSlots({}, { onDelete });
    await flushConfig();

    fireEvent.click(wide().getByLabelText(t("delete")));

    expect(onDelete).toHaveBeenCalledWith(script);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("回收站关闭时，更多菜单里的删除先弹「此操作无法撤销」确认框，确认前不调用 onDelete", async () => {
    trashOff();
    const onDelete = vi.fn();
    renderSlots({}, { onDelete });
    await flushConfig();
    openMore();

    fireEvent.click(screen.getByText(t("delete")));

    expect(await screen.findByText(t("script:confirm_delete_script_content", { name: "脚本A" }))).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("回收站关闭时，确认框中点击删除后才触发 onDelete", async () => {
    trashOff();
    const onDelete = vi.fn();
    const { script } = renderSlots({}, { onDelete });
    await flushConfig();
    openMore();
    fireEvent.click(screen.getByText(t("delete")));
    await screen.findByText(t("script:confirm_delete_script_content", { name: "脚本A" }));

    // 菜单项与确认按钮同名（删除），确认按钮是最后出现的那个
    const buttons = screen.getAllByText(t("delete"), { selector: "button" });
    fireEvent.click(buttons[buttons.length - 1]);

    expect(onDelete).toHaveBeenCalledWith(script);
  });

  it("回收站关闭时，确认框中点击取消不触发 onDelete", async () => {
    trashOff();
    const onDelete = vi.fn();
    renderSlots({}, { onDelete });
    await flushConfig();
    openMore();
    fireEvent.click(screen.getByText(t("delete")));
    await screen.findByText(t("script:confirm_delete_script_content", { name: "脚本A" }));

    await act(async () => fireEvent.click(screen.getByText(t("editor:cancel"), { selector: "button" })));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("回收站配置尚未读到时按不可撤销处理，仍先弹确认框", async () => {
    get.mockImplementation(() => new Promise(() => {}));
    const onDelete = vi.fn();
    renderSlots({}, { onDelete });

    fireEvent.click(wide().getByLabelText(t("delete")));

    expect(await screen.findByText(t("script:confirm_delete_script_content", { name: "脚本A" }))).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("更多菜单里的导出按单个脚本导出", async () => {
    renderSlots();
    openMore();

    fireEvent.click(screen.getByText(t("export")));

    expect(exportScripts).toHaveBeenCalledWith(["u1"]);
  });
});

describe("ScriptListEmpty 脚本列表空状态", () => {
  it("没有任何脚本时给出新建入口，点击进入编辑器", () => {
    const navigate = vi.fn();
    render(<ScriptListEmpty filtered={false} onClearFilters={vi.fn()} navigate={navigate} />);

    expect(screen.getByText(t("no_scripts"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("script:create_script") }));

    expect(navigate).toHaveBeenCalledWith("/script/editor");
    expect(screen.queryByRole("button", { name: t("clear_filter") })).not.toBeInTheDocument();
  });

  it("没有任何脚本时「获取脚本」打开脚本站", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<ScriptListEmpty filtered={false} onClearFilters={vi.fn()} navigate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: t("get_script") }));

    expect(openSpy).toHaveBeenCalledWith("https://scriptcat.org/search", "_blank");
    openSpy.mockRestore();
  });

  it("搜索或筛选无结果时说明原因并提供清除筛选，而不是提示新建", () => {
    const onClearFilters = vi.fn();
    render(<ScriptListEmpty filtered onClearFilters={onClearFilters} navigate={vi.fn()} />);

    expect(screen.getByText(t("script:no_matching_scripts"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("script:create_script") })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("clear_filter") }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});

describe("UpdateTimeCell 检查更新交互", () => {
  const makeScript = (over: Record<string, unknown> = {}) =>
    ({ uuid: "u1", updatetime: 1700000000000, checkUpdateUrl: "https://x/u.user.js", metadata: {}, ...over }) as never;

  it("默认就常驻显示『检查更新』按钮（不再 opacity-0 隐藏）", () => {
    renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    expect(screen.getByLabelText(t("check_update"))).toBeInTheDocument();
  });

  it("无 checkUpdateUrl 时不显示检查更新按钮", () => {
    renderWithTooltip(<UpdateTimeCell script={makeScript({ checkUpdateUrl: undefined })} />);
    expect(screen.queryByLabelText(t("check_update"))).toBeNull();
  });

  it("点击后调用 requestCheckUpdate", () => {
    requestCheckUpdate.mockReturnValue(new Promise(() => {}));
    renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    fireEvent.click(screen.getByLabelText(t("check_update")));
    expect(requestCheckUpdate).toHaveBeenCalledWith("u1");
  });

  it("检查到已是最新时内联提示『已是最新版本』", async () => {
    requestCheckUpdate.mockResolvedValue(false);
    renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    fireEvent.click(screen.getByLabelText(t("check_update")));
    expect(await screen.findByText(t("script:latest_version"))).toBeInTheDocument();
  });

  it("检查失败时提示检查更新失败，不误报『已是最新版本』", async () => {
    requestCheckUpdate.mockRejectedValue(new Error("fetch script info failed"));
    renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    fireEvent.click(screen.getByLabelText(t("check_update")));
    await act(async () => {});
    expect(notify.error).toHaveBeenCalledWith(`${t("script:update_check_failed")}: Error: fetch script info failed`);
    expect(screen.queryByText(t("script:latest_version"))).toBeNull();
    // 失败后恢复可再次点击检查
    expect(screen.getByLabelText(t("check_update"))).toBeInTheDocument();
  });

  it("检查到新版本时显示『存在新版本』入口", async () => {
    requestCheckUpdate.mockResolvedValue(true);
    renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    fireEvent.click(screen.getByLabelText(t("check_update")));
    expect(await screen.findByText(t("script:new_version_available"))).toBeInTheDocument();
  });

  it("检查到新版本时『存在新版本』直接取代更新时间", async () => {
    requestCheckUpdate.mockResolvedValue(true);
    const { container } = renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    // 初始（idle）应显示相对时间
    expect(container.textContent?.trim()).not.toBe("");
    fireEvent.click(screen.getByLabelText(t("check_update")));
    await screen.findByText(t("script:new_version_available"));
    // 时间被入口取代：整格可见文本只剩「存在新版本」
    expect(container.textContent).toBe(t("script:new_version_available"));
  });

  it("『存在新版本』为内联文字样式：无胶囊背景且不会竖排换行", async () => {
    requestCheckUpdate.mockResolvedValue(true);
    renderWithTooltip(<UpdateTimeCell script={makeScript()} />);
    fireEvent.click(screen.getByLabelText(t("check_update")));
    const button = (await screen.findByText(t("script:new_version_available"))).closest("button")!;
    // 与「已是最新版本」一致的内联文字：不再用 rounded-full 胶囊背景
    expect(button.className).not.toContain("bg-primary/10");
    expect(button.className).not.toContain("rounded-full");
    // whitespace-nowrap 保证中文不会被窄槽位挤成一字一行
    expect(button).toHaveClass("whitespace-nowrap");
  });
});

describe("脚本类型标签 scriptTypeLabel", () => {
  it("定时脚本应返回『定时脚本』而非『后台脚本』", () => {
    expect(scriptTypeLabel(SCRIPT_TYPE_CRONTAB, t)).toBe(t("script:scheduled_script"));
  });

  it("后台脚本应返回『后台脚本』", () => {
    expect(scriptTypeLabel(SCRIPT_TYPE_BACKGROUND, t)).toBe(t("script:background_script"));
  });
});

describe("ScheduleNextRun 定时脚本下次运行时间", () => {
  const makeScript = (over: Record<string, unknown> = {}) =>
    ({ uuid: "u1", name: "S", metadata: {}, type: SCRIPT_TYPE_NORMAL, ...over }) as never;

  it("定时脚本行内只展示时间，省去「下次运行」前缀以适配窄槽位", () => {
    renderWithTooltip(
      <ScheduleNextRun script={makeScript({ type: SCRIPT_TYPE_CRONTAB, metadata: { crontab: ["0 8 * * *"] } })} />
    );
    // 140px 槽位放不下「下次运行 + 完整时间」，行内只保留时间，避免截断
    const timeNode = screen.getByText("2026-06-25 08:00:00");
    expect(timeNode).toBeInTheDocument();
    expect(timeNode.textContent).not.toContain(t("script:next_run"));
  });

  it("悬浮时通过 Tooltip 展示完整「下次运行」文案与原始 cron 表达式，截断也不丢信息", async () => {
    // delayDuration=0 让 Tooltip 悬浮即开，避免依赖默认 700ms 延迟
    render(
      <TooltipProvider delayDuration={0}>
        <ScheduleNextRun script={makeScript({ type: SCRIPT_TYPE_CRONTAB, metadata: { crontab: ["0 8 * * *"] } })} />
      </TooltipProvider>
    );
    // 鼠标移入 trigger 让 Radix Tooltip 展开（delayDuration=0 + 等定时器刷新）
    const trigger = screen.getByText("2026-06-25 08:00:00").closest('[data-slot="tooltip-trigger"]')!;
    await act(async () => {
      fireEvent.pointerMove(trigger, { pointerType: "mouse" });
      // Radix Tooltip 的 delayDuration=0 仍通过真实 timer 刷新 Portal；这是该时序契约本身。
      // eslint-disable-next-line scriptcat/no-test-fixed-sleep -- Radix Tooltip timer contract
      await new Promise((r) => setTimeout(r, 20));
    });
    // Tooltip 内容经 Portal 渲染，含完整文案与 cron 表达式（Radix 会额外渲染一份无障碍副本，故用 getAllByText）
    expect(screen.getAllByText("0 8 * * *").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText((c) => c.includes(t("script:next_run")) && c.includes("2026-06-25 08:00:00")).length
    ).toBeGreaterThan(0);
  });

  it("普通脚本不渲染下次运行时间", () => {
    const { container } = renderWithTooltip(<ScheduleNextRun script={makeScript()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("定时脚本缺少 crontab 元数据时不渲染", () => {
    const { container } = renderWithTooltip(<ScheduleNextRun script={makeScript({ type: SCRIPT_TYPE_CRONTAB })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
