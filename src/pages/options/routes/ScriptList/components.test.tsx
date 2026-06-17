import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";
import { SCRIPT_TYPE_NORMAL, SCRIPT_TYPE_BACKGROUND } from "@App/app/repo/scripts";
import { TooltipProvider } from "@App/pages/components/ui/tooltip";

// requestCheckUpdate 走后台消息，统一打桩；用 hoisted 以便在 vi.mock 工厂内引用
const { requestCheckUpdate } = vi.hoisted(() => ({ requestCheckUpdate: vi.fn() }));
vi.mock("@App/pages/store/features/script", () => ({
  scriptClient: { requestCheckUpdate },
}));

import { getScriptHomePage, ScriptRowActions, UpdateTimeCell } from "./components";

beforeEach(() => {
  initLanguage("zh-CN");
  vi.clearAllMocks();
});
afterEach(cleanup);

const renderWithTooltip = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

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

  it("后台脚本显示运行按钮（标签为「运行」而非进度提示），点击触发 onRunStop", () => {
    const onRunStop = vi.fn();
    const script = makeScript({ type: SCRIPT_TYPE_BACKGROUND });
    renderWithTooltip(<ScriptRowActions script={script} navigate={vi.fn()} onDelete={vi.fn()} onRunStop={onRunStop} />);
    fireEvent.click(screen.getByRole("button", { name: t("editor:run") }));
    expect(onRunStop).toHaveBeenCalledWith(script);
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
});
