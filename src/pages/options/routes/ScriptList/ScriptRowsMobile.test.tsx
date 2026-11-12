import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { renderWithRouterTooltip } from "@Tests/renderWithTooltip";
import {
  SCRIPT_RUN_STATUS_COMPLETE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import type { ScriptLoading } from "@App/pages/store/features/script";

const { exportMock, checkUpdateMock } = vi.hoisted(() => ({ exportMock: vi.fn(), checkUpdateMock: vi.fn() }));
vi.mock("@App/pages/store/features/script", async () => {
  const { createScriptStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createScriptStoreMock({
    requestEnableScript: vi.fn(() => Promise.resolve()),
    scriptClient: { requestCheckUpdate: checkUpdateMock },
    synchronizeClient: { export: exportMock.mockResolvedValue(undefined) },
  });
});

// useSystemConfig("trash_enabled") 读的是这个 store；默认给回收站「开启」，删除用例里再按需切到 false
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({
    systemConfig: { get, getLanguage: vi.fn().mockResolvedValue("zh-CN"), set: vi.fn() },
  });
});

const { notify } = vi.hoisted(() => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), loading: vi.fn() },
}));
vi.mock("@App/pages/components/ui/toast", () => ({ notify }));

import ScriptRowsMobile from "./ScriptRowsMobile";

beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => {
  get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? true : 30));
});
afterEach(cleanup);

const script = {
  uuid: "u1",
  name: "示例脚本",
  namespace: "test",
  metadata: { version: ["1.0.0"] },
  type: SCRIPT_TYPE_NORMAL,
  status: SCRIPT_STATUS_ENABLE,
  sort: 0,
  runStatus: SCRIPT_RUN_STATUS_COMPLETE,
  createtime: 1700000000000,
  updatetime: 1700000000000,
  checktime: 1700000000000,
} satisfies ScriptLoading;

const backgroundScript = { ...script, uuid: "u2", name: "后台脚本", type: SCRIPT_TYPE_BACKGROUND };

const baseProps = {
  scriptList: [script] as ScriptLoading[],
  loadingList: false,
  updateScripts: vi.fn(),
  handleDelete: vi.fn(),
  handleRunStop: vi.fn(),
  scriptListSortOrderMove: vi.fn(),
  selectionMode: false,
  selectedUuids: new Set<string>(),
  toggleSelect: vi.fn(),
  onEnterSelectionMode: vi.fn(),
  filtered: false,
  onClearFilters: vi.fn(),
};

// dnd-kit 会把 role="button" 挂到外层可拖拽容器上，按角色取会同时命中整行；
// 这里直接点主体槽位，与真实点击落点一致。
const sheet = () => document.querySelector<HTMLElement>('[data-slot="mobile-action-sheet"]')!;
const tapRow = (index = 0) => fireEvent.click(document.querySelectorAll('[data-slot="mobile-list-row-main"]')[index]);

describe("移动端脚本行", () => {
  it("站点图标数据到达前不显示站点数，避免先闪出「0 个站点」", () => {
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} />);
    expect(screen.queryByText(new RegExp(t("script:site_count", { count: 0 })))).toBeNull();
  });

  it("站点图标数据到达后显示站点数", () => {
    const loaded = { ...script, favorite: [{ match: "https://a.com/*" }, { match: "https://b.com/*" }] };
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} scriptList={[loaded]} />);
    expect(screen.getByText(new RegExp(t("script:site_count", { count: 2 })))).toBeTruthy();
  });

  it("空列表与加载态沿用既有提示", () => {
    const { rerender } = renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} scriptList={[]} />);
    expect(screen.getByText(t("no_scripts"))).toBeInTheDocument();

    rerender(<ScriptRowsMobile {...baseProps} scriptList={[]} loadingList />);
    expect(screen.getByText(t("loading"))).toBeInTheDocument();
  });

  it("行采用移动端槽位骨架，开关在右锚区", () => {
    const { container } = renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} />);

    expect(container.querySelectorAll('[data-slot="mobile-list-row"]')).toHaveLength(1);
    const trailing = container.querySelector('[data-slot="mobile-list-row-trailing"]')!;
    expect(trailing.querySelector('[role="switch"]')).not.toBeNull();
  });

  it("拖拽手柄阻止浏览器触摸滚动接管指针手势", () => {
    const { container } = renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} />);
    const handle = container.querySelector('[data-slot="mobile-list-row-leading"] > span');
    expect(handle).toHaveClass("touch-none");
  });

  it("整行点击打开底部操作面板，面板含删除等动作", () => {
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} />);

    tapRow();

    const sheet = document.querySelector('[data-slot="mobile-action-sheet"]')!;
    expect(sheet).not.toBeNull();
    expect(sheet.textContent).toContain(t("edit"));
    expect(sheet.textContent).toContain(t("check_update"));
    expect(sheet.textContent).toContain(t("export"));
    expect(sheet.textContent).toContain(t("delete"));
  });

  it("面板里检查更新失败时提示检查更新失败", async () => {
    checkUpdateMock.mockRejectedValueOnce(new Error("fetch script info failed"));
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} />);
    tapRow();

    const sheet = document.querySelector('[data-slot="mobile-action-sheet"]') as HTMLElement;
    fireEvent.click(within(sheet).getByText(t("check_update")));
    await act(async () => {});

    expect(checkUpdateMock).toHaveBeenCalledWith(script.uuid);
    expect(notify.error).toHaveBeenCalledWith(`${t("script:update_check_failed")}: Error: fetch script info failed`);
  });

  it("后台脚本的面板保留运行入口，普通脚本不渲染", () => {
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} scriptList={[backgroundScript]} />);
    tapRow();

    expect(document.querySelector('[data-slot="mobile-action-sheet"]')!.textContent).toContain(t("editor:run"));

    cleanup();
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} />);
    tapRow();
    expect(document.querySelector('[data-slot="mobile-action-sheet"]')!.textContent).not.toContain(t("editor:run"));
  });

  it("脚本声明了反馈链接时面板出现反馈项，点击打开新标签", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const withSupport = { ...script, metadata: { ...script.metadata, support: ["https://support"] } };
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} scriptList={[withSupport]} />);
    tapRow();

    fireEvent.click(screen.getByText(t("script:support")));

    expect(openSpy).toHaveBeenCalledWith("https://support", "_blank");
    openSpy.mockRestore();
  });

  it("面板里的导出按单个脚本导出", () => {
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} />);
    tapRow();

    fireEvent.click(screen.getByText(t("export")));

    expect(exportMock).toHaveBeenCalledWith(["u1"]);
  });

  it("回收站开启时，面板里的删除直接执行，不弹确认框（由撤销 toast 兜底）", async () => {
    const handleDelete = vi.fn();
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} handleDelete={handleDelete} />);
    await act(async () => {});
    tapRow();

    fireEvent.click(within(sheet()).getByText(t("delete")));

    expect(handleDelete).toHaveBeenCalledWith(script);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("回收站关闭时，面板里的删除先弹「此操作无法撤销」确认框，确认后才执行", async () => {
    get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? false : 30));
    const handleDelete = vi.fn();
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} handleDelete={handleDelete} />);
    await act(async () => {});
    tapRow();

    fireEvent.click(within(sheet()).getByText(t("delete")));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(t("script:confirm_delete_script_content", { name: script.name }));
    expect(handleDelete).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByText(t("delete"), { selector: "button" }));
    expect(handleDelete).toHaveBeenCalledWith(script);
  });

  it("左滑露出编辑与删除", () => {
    const { container } = renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} />);
    const row = container.querySelector('[data-slot="mobile-swipe-row"]')!;

    fireEvent.touchStart(row, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 100 }] });

    const actions = container.querySelector('[data-slot="mobile-swipe-actions"]')!;
    expect(actions).toHaveAttribute("data-state", "open");
    expect(actions.textContent).toContain(t("edit"));
    expect(actions.textContent).toContain(t("delete"));
  });

  it("长按进入多选模式并选中该行", () => {
    vi.useFakeTimers();
    const onEnterSelectionMode = vi.fn();
    const { container } = renderWithRouterTooltip(
      <ScriptRowsMobile {...baseProps} onEnterSelectionMode={onEnterSelectionMode} />
    );

    fireEvent.touchStart(container.querySelector('[data-slot="mobile-swipe-row"]')!, { touches: [{ clientX: 10 }] });
    vi.advanceTimersByTime(600);

    expect(onEnterSelectionMode).toHaveBeenCalledWith("u1");
    vi.useRealTimers();
  });

  it("多选模式下左端出现勾选框、开关隐藏，点击行切换选中", () => {
    const toggleSelect = vi.fn();
    const { container } = renderWithRouterTooltip(
      <ScriptRowsMobile {...baseProps} selectionMode selectedUuids={new Set(["u1"])} toggleSelect={toggleSelect} />
    );

    const leading = container.querySelector('[data-slot="mobile-list-row-leading"]')!;
    expect(leading.querySelector('[role="checkbox"]')).not.toBeNull();
    expect(container.querySelector('[role="switch"]')).toBeNull();
    expect(container.querySelector('[data-slot="mobile-list-row"]')!.className).toContain("bg-primary/10");

    tapRow();
    expect(toggleSelect).toHaveBeenCalledWith("u1");
    expect(document.querySelector('[data-slot="mobile-action-sheet"]')).toBeNull();
  });
});
