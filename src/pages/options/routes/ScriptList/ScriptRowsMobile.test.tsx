import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
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

import ScriptRowsMobile from "./ScriptRowsMobile";

beforeAll(() => initTestLanguage("zh-CN"));
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
};

// dnd-kit 会把 role="button" 挂到外层可拖拽容器上，按角色取会同时命中整行；
// 这里直接点主体槽位，与真实点击落点一致。
const tapRow = (index = 0) => fireEvent.click(document.querySelectorAll('[data-slot="mobile-list-row-main"]')[index]);

describe("移动端脚本行", () => {
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

  it("后台脚本的面板保留运行入口，普通脚本不渲染", () => {
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} scriptList={[backgroundScript]} />);
    tapRow();

    expect(document.querySelector('[data-slot="mobile-action-sheet"]')!.textContent).toContain(t("editor:run"));

    cleanup();
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} />);
    tapRow();
    expect(document.querySelector('[data-slot="mobile-action-sheet"]')!.textContent).not.toContain(t("editor:run"));
  });

  it("面板里的导出按单个脚本导出", () => {
    renderWithRouterTooltip(<ScriptRowsMobile {...baseProps} />);
    tapRow();

    fireEvent.click(screen.getByText(t("export")));

    expect(exportMock).toHaveBeenCalledWith(["u1"]);
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
