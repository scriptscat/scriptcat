import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithThemeRouter } from "@Tests/renderWithThemeRouter";
import { cspRemovalAction, type NetworkRule } from "@App/app/repo/network_rule";
import type { NetworkRuleClient } from "@App/app/service/service_worker/client";
import type { NetworkRuleSnapshot } from "@App/app/service/service_worker/network_rule";

import NetworkRules from ".";
import { stubNotify } from "./test-helpers";

const PAGE_ROWS = 20;

const reads = { count: 0 };

beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => {
  mockMatchMedia();
  vi.clearAllMocks();
  stubNotify();
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

function clientFor(rules: NetworkRule[]): NetworkRuleClient {
  const snapshot: NetworkRuleSnapshot = {
    state: { schemaVersion: 1, revision: 3, masterEnabled: true, rules, order: rules.map((r) => r.id) },
    apply: { state: "applied", revision: 3, appliedAt: 1 },
  };
  return {
    getState: vi.fn().mockResolvedValue(snapshot),
    createRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRules: vi.fn(),
    setRulesEnabled: vi.fn(),
    setMasterEnabled: vi.fn(),
    reorderRules: vi.fn(),
    retryApply: vi.fn(),
  } as unknown as NetworkRuleClient;
}

async function renderRows() {
  renderWithThemeRouter(
    <Routes>
      <Route
        path="/tools/network-rules"
        element={<NetworkRules client={clientFor(Array.from({ length: PAGE_ROWS }, (_, index) => rule(index)))} />}
      />
    </Routes>,
    { initialEntries: ["/tools/network-rules"] }
  );
  expect(await screen.findByText("规则 0")).toBeInTheDocument();
  expect(screen.getAllByTestId("network-rule-row")).toHaveLength(PAGE_ROWS);
}

describe("网络规则列表页的行渲染开销", () => {
  it("首屏 20 行各渲染一次，不重复渲染", async () => {
    await renderRows();

    expect(reads.count).toBe(PAGE_ROWS);
  });

  it("搜索按键不改变可见行时，一行也不重算", async () => {
    await renderRows();
    // 第一个字符会把手柄从可拖变成禁用，整页行本来就该重算一次；量的是后续按键。
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "规" } });
    reads.count = 0;

    // 「规则」是所有行的公共前缀：可见行集合与顺序都不变，变的只是父级重渲染这件事本身。
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "规则" } });

    expect(screen.getAllByTestId("network-rule-row")).toHaveLength(PAGE_ROWS);
    expect(reads.count).toBe(0);
  });

  it("勾选一行只重算那一行，其余 19 行不受影响", async () => {
    await renderRows();
    reads.count = 0;

    // 按 aria-label 取：20 行的表上整页 role 扫描要给 21 个复选框各算一遍可访问名，约 46ms。
    fireEvent.click(screen.getByLabelText("选择 规则 7"));

    expect(reads.count).toBe(1);
  });
});
