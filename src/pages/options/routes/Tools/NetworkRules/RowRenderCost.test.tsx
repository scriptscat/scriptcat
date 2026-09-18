import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { cspRemovalAction, type NetworkRule } from "@App/app/repo/network_rule";

import RuleTable from "./RuleTable";

const PAGE_ROWS = 20;

const reads = { count: 0 };

beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => {
  mockMatchMedia();
  vi.clearAllMocks();
  reads.count = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

/**
 * 行渲染次数的计数器：updatedAt 只被行内的「最近修改时间」读，一次行渲染恰好读一次，
 * 页面其余部分都不碰它。用测试自己的数据对象计数而不是 mock 模块，是因为 ui 项目
 * isolate:false 共享模块缓存，模块级 mock 会随文件调度顺序时灵时不灵。
 * 量的是行重算的次数本身，不是某个组件有没有被 memo 包住。
 */
function rule(index: number): NetworkRule {
  const value: NetworkRule = {
    id: `r${index}`,
    name: `规则 ${index}`,
    enabled: true,
    condition: { requestDomains: [`s${index}.example.com`] },
    action: cspRemovalAction(),
    createdAt: 1,
    updatedAt: 1,
  };
  return Object.defineProperty(value, "updatedAt", {
    enumerable: true,
    get() {
      reads.count += 1;
      return 1;
    },
  });
}

function listProps(rules: NetworkRule[]) {
  return {
    rules,
    positionOf: (target: NetworkRule) => rules.findIndex((rule) => rule.id === target.id) + 1,
    total: rules.length,
    // 行 memo 化本身与 dnd-kit 接线无关；拖拽分支由 DragAccessibility 与页面集成测试覆盖。
    dragDisabled: true,
    busy: false,
    onToggleEnabled: vi.fn(),
    onDragEnd: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onMoveTop: vi.fn(),
    onMoveBottom: vi.fn(),
    onMoveTo: vi.fn(),
  };
}

function renderRows() {
  const rules = Array.from({ length: PAGE_ROWS }, (_, index) => rule(index));
  const props = listProps(rules);
  const onSelect = vi.fn();
  const onSelectPage = vi.fn();
  const view = render(
    <RuleTable {...props} selected={new Set<string>()} onSelect={onSelect} onSelectPage={onSelectPage} />
  );
  expect(screen.getByText("规则 0")).toBeInTheDocument();
  expect(screen.getAllByTestId("network-rule-row")).toHaveLength(PAGE_ROWS);
  return { props, view, onSelect, onSelectPage };
}

describe("网络规则列表页的行渲染开销", () => {
  it("首屏 20 行各渲染一次，不重复渲染", () => {
    renderRows();

    expect(reads.count).toBe(PAGE_ROWS);
  });

  it("父级刷新但可见行不变时，一行也不重算", () => {
    const { props, view, onSelect, onSelectPage } = renderRows();
    reads.count = 0;

    // 「规则」是所有行的公共前缀：可见行集合与顺序都不变，变的只是父级传入了新数组。
    view.rerender(
      <RuleTable
        {...props}
        dragDisabled
        rules={[...props.rules]}
        selected={new Set<string>()}
        onSelect={onSelect}
        onSelectPage={onSelectPage}
      />
    );

    expect(screen.getAllByTestId("network-rule-row")).toHaveLength(PAGE_ROWS);
    expect(reads.count).toBe(0);
  });

  it("勾选一行只重算那一行，其余 19 行不受影响", () => {
    const { props, view, onSelect, onSelectPage } = renderRows();
    reads.count = 0;

    view.rerender(<RuleTable {...props} selected={new Set(["r7"])} onSelect={onSelect} onSelectPage={onSelectPage} />);

    expect(reads.count).toBe(1);
  });
});
