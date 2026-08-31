import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { cspRemovalAction, type NetworkRule } from "@App/app/repo/network_rule";
import RuleCards from "./RuleCards";
import RuleTable from "./RuleTable";

beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => {
  mockMatchMedia();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

function rule(index: number): NetworkRule {
  return {
    id: `r${index}`,
    name: `规则 ${index}`,
    enabled: true,
    condition: { requestDomains: [`s${index}.example.com`] },
    action: cspRemovalAction(),
    createdAt: 1,
    updatedAt: 1,
  };
}

const RULES = [rule(1), rule(2), rule(3)];
const onToggleEnabled = vi.fn();

const listProps = {
  rules: RULES,
  positionOf: (target: NetworkRule) => RULES.findIndex((r) => r.id === target.id) + 1,
  total: RULES.length,
  dragDisabled: false,
  busy: false,
  onToggleEnabled,
  onDragEnd: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onMoveTop: vi.fn(),
  onMoveBottom: vi.fn(),
  onMoveTo: vi.fn(),
};

function renderTable() {
  render(<RuleTable {...listProps} selected={new Set<string>()} onSelect={vi.fn()} onSelectPage={vi.fn()} />);
}

function handleOf(container: HTMLElement, name: string) {
  return within(container).getByRole("button", { name: `调整 ${name} 的顺序` });
}

function announcement(): string {
  return screen.getByRole("status").textContent ?? "";
}

/** dnd-kit 依赖真实排版测量，happy-dom 无布局，用行序号伪造矩形驱动传感器。 */
function stubRowRects() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const row = this.closest("[data-testid='network-rule-row']") as HTMLElement | null;
    const index = row ? screen.getAllByTestId("network-rule-row").indexOf(row) : -1;
    const top = index < 0 ? 0 : index * 60;
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      right: 900,
      bottom: top + 60,
      width: 900,
      height: 60,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** PointerSensor 的长按激活走 setTimeout；只伪造 setTimeout，React 与 Radix 的调度保持真实。 */
function pressAndHold(element: HTMLElement) {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  fireEvent.pointerDown(element, { button: 0, isPrimary: true });
  advance(400);
}

/** 激活过的指针传感器会在 document 上挂捕获阶段的 click 拦截，detach 后延时 50ms 才摘除，必须走完再交还真实时钟。 */
function release(element: HTMLElement) {
  fireEvent.pointerUp(element);
  advance(100);
  vi.useRealTimers();
}

describe("网络规则拖拽可达性", () => {
  it("表格行保持行/单元格语义，拖拽语义只落在手柄上", () => {
    renderTable();

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(4);
    for (const row of rows.slice(1)) {
      expect(row).not.toHaveAttribute("tabindex");
      expect(row).not.toHaveAttribute("aria-roledescription");
    }

    const handle = handleOf(rows[1], "规则 1");
    expect(handle).toHaveAttribute("aria-roledescription");
    const describedBy = handle.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toContain("空格");
  });

  it("键盘拖拽全程用中文播报规则名与位次，而不是规则 ID", async () => {
    renderTable();
    stubRowRects();
    const handle = handleOf(screen.getAllByRole("row")[3], "规则 3");

    fireEvent.keyDown(handle, { code: "Space" });
    expect(announcement()).toContain("规则 3");
    expect(announcement()).toContain("第 3 位");
    expect(announcement()).not.toContain("r3");

    // KeyboardSensor 的 keydown 监听器在 setTimeout 里挂载，激活后必须让出一次事件循环。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.keyDown(handle, { code: "ArrowUp" });
    fireEvent.keyDown(handle, { code: "ArrowUp" });
    fireEvent.keyDown(handle, { code: "Space" });
    expect(announcement()).toContain("已放到第 1 位");
  });

  it("移动端卡片给出可见手柄，长按手柄拿起卡片", () => {
    render(<RuleCards {...listProps} />);
    const handle = handleOf(screen.getAllByTestId("network-rule-row")[0], "规则 1");

    pressAndHold(handle);
    expect(announcement()).toContain("规则 1");
    release(handle);
  });

  it("长按卡片上的启用开关不会把卡片拿起来，点按即切换启用", () => {
    render(<RuleCards {...listProps} />);
    const toggle = within(screen.getAllByTestId("network-rule-row")[0]).getByRole("switch");

    fireEvent.click(toggle);
    expect(onToggleEnabled).toHaveBeenCalledWith(RULES[0], false);

    pressAndHold(toggle);
    expect(announcement()).toBe("");
    release(toggle);
  });
});
