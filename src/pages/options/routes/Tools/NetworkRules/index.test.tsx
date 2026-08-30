import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithThemeRouter } from "@Tests/renderWithThemeRouter";
import { cspRemovalAction, type NetworkRule } from "@App/app/repo/network_rule";
import type { NetworkRuleClient } from "@App/app/service/service_worker/client";
import type { NetworkRuleSnapshot } from "@App/app/service/service_worker/network_rule";

const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("@App/pages/components/ui/toast", () => ({ notify }));

import NetworkRules from ".";

beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => {
  mockMatchMedia();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

function rule(index: number, over: Partial<NetworkRule> = {}): NetworkRule {
  return {
    id: `r${index}`,
    name: `规则 ${index}`,
    enabled: true,
    condition: { requestDomains: [`s${index}.example.com`] },
    action: cspRemovalAction(),
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function snapshot(rules: NetworkRule[], order = rules.map((r) => r.id)): NetworkRuleSnapshot {
  return {
    state: { schemaVersion: 1, revision: 3, masterEnabled: true, rules, order },
    apply: { state: "applied", revision: 3, appliedAt: 1 },
  };
}

function clientFor(current: NetworkRuleSnapshot, overrides: Partial<NetworkRuleClient> = {}): NetworkRuleClient {
  return {
    getState: vi.fn().mockResolvedValue(current),
    createRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
    setRuleEnabled: vi.fn(),
    setMasterEnabled: vi.fn(),
    // 服务端会带着新顺序回包，mock 必须还原这一点，否则页面无从判断保存是否生效。
    reorderRules: vi.fn(async ({ order }: { order: string[] }) => ({
      state: { ...current.state, revision: current.state.revision + 1, order },
      apply: { state: "applied" as const, revision: current.state.revision + 1, appliedAt: 2 },
      outcome: "applied" as const,
    })),
    retryApply: vi.fn(),
    ...overrides,
  } as unknown as NetworkRuleClient;
}

function renderPage(client: NetworkRuleClient) {
  return renderWithThemeRouter(
    <Routes>
      <Route path="/tools/network-rules" element={<NetworkRules client={client} />} />
    </Routes>,
    { initialEntries: ["/tools/network-rules"] }
  );
}

function rowNames(): string[] {
  return screen
    .getAllByTestId("network-rule-row")
    .map((row) => within(row).getByTestId("network-rule-name").textContent ?? "");
}

/** dnd-kit 依赖真实排版测量，happy-dom 无布局，用行序号伪造矩形驱动键盘传感器。 */
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

/** KeyboardSensor 的 keydown 监听器在 setTimeout 里挂载，激活后必须让出一次事件循环。 */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openRowMenu(row: HTMLElement) {
  const trigger = within(row).getByRole("button", { name: "更多操作" });
  fireEvent.pointerDown(trigger, { button: 0 });
  fireEvent.click(trigger);
  await flush();
}

describe("网络规则列表页", () => {
  it("按列表顺序渲染全部规则，而不是按存储数组顺序", async () => {
    const rules = [rule(1), rule(2), rule(3)];
    const client = clientFor(snapshot(rules, ["r3", "r1", "r2"]));
    renderPage(client);

    expect(await screen.findByText("规则 3")).toBeInTheDocument();
    expect(rowNames()).toEqual(["规则 3", "规则 1", "规则 2"]);
  });

  it("把第 3 行拖到首位后立即持久化新顺序", async () => {
    const client = clientFor(snapshot([rule(1), rule(2), rule(3)]));
    renderPage(client);
    expect(await screen.findByText("规则 3")).toBeInTheDocument();
    stubRowRects();

    const handle = within(screen.getAllByTestId("network-rule-row")[2]).getByRole("button", { name: /规则 3/ });
    fireEvent.keyDown(handle, { code: "Space" });
    await flush();
    fireEvent.keyDown(handle, { code: "ArrowUp" });
    fireEvent.keyDown(handle, { code: "ArrowUp" });
    fireEvent.keyDown(handle, { code: "Space" });
    await flush();

    expect(client.reorderRules).toHaveBeenCalledWith({ baseRevision: 3, order: ["r3", "r1", "r2"] });
    expect(rowNames()).toEqual(["规则 3", "规则 1", "规则 2"]);
  });

  it("排序保存失败时回滚显示顺序并提示", async () => {
    const client = clientFor(snapshot([rule(1), rule(2), rule(3)]), {
      reorderRules: vi.fn().mockRejectedValue(JSON.stringify({ code: "storage_write_failed" })),
    });
    renderPage(client);
    expect(await screen.findByText("规则 3")).toBeInTheDocument();
    stubRowRects();

    const handle = within(screen.getAllByTestId("network-rule-row")[2]).getByRole("button", { name: /规则 3/ });
    fireEvent.keyDown(handle, { code: "Space" });
    await flush();
    fireEvent.keyDown(handle, { code: "ArrowUp" });
    fireEvent.keyDown(handle, { code: "ArrowUp" });
    fireEvent.keyDown(handle, { code: "Space" });
    await flush();

    expect(client.reorderRules).toHaveBeenCalled();
    expect(rowNames()).toEqual(["规则 1", "规则 2", "规则 3"]);
    expect(notify.error).toHaveBeenCalledWith("顺序未能保存，已恢复原顺序。");
  });

  it("搜索时手柄置灰，但行菜单的置顶仍能跨页移动规则", async () => {
    const rules = Array.from({ length: 25 }, (_, index) => rule(index));
    const client = clientFor(snapshot(rules));
    renderPage(client);
    expect(await screen.findByText("规则 0")).toBeInTheDocument();
    expect(screen.getAllByTestId("network-rule-row")).toHaveLength(20);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "规则 22" } });
    const row = screen.getAllByTestId("network-rule-row")[0];
    expect(rowNames()).toEqual(["规则 22"]);
    expect(within(row).getByRole("button", { name: /规则 22/ })).toBeDisabled();

    await openRowMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: "置顶" }));
    await flush();

    const order = vi.mocked(client.reorderRules).mock.calls[0][0].order;
    expect(order).toHaveLength(25);
    expect(order[0]).toBe("r22");
  });

  it("清除筛选后恢复完整列表，手柄重新可用", async () => {
    const rules = Array.from({ length: 25 }, (_, index) => rule(index));
    renderPage(clientFor(snapshot(rules)));
    expect(await screen.findByText("规则 0")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "规则 22" } });
    expect(rowNames()).toEqual(["规则 22"]);

    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.getAllByTestId("network-rule-row")).toHaveLength(20);
    expect(
      within(screen.getAllByTestId("network-rule-row")[0]).getByRole("button", { name: /规则 0/ })
    ).not.toBeDisabled();
  });

  it("行菜单可以把规则移到指定位置", async () => {
    const rules = Array.from({ length: 25 }, (_, index) => rule(index));
    const client = clientFor(snapshot(rules));
    renderPage(client);
    expect(await screen.findByText("规则 0")).toBeInTheDocument();

    await openRowMenu(screen.getAllByTestId("network-rule-row")[0]);
    fireEvent.click(await screen.findByRole("menuitem", { name: "移到…" }));
    fireEvent.change(await screen.findByRole("spinbutton"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "移动" }));
    await flush();

    const order = vi.mocked(client.reorderRules).mock.calls[0][0].order;
    expect(order[24]).toBe("r0");
    expect(order).toHaveLength(25);
  });

  it("没有规则时展示空态", async () => {
    renderPage(clientFor(snapshot([])));
    expect(await screen.findByText("还没有网络规则")).toBeInTheDocument();
    expect(screen.queryAllByTestId("network-rule-row")).toHaveLength(0);
  });

  it("搜索无结果时展示无结果态而不是空态", async () => {
    renderPage(clientFor(snapshot([rule(1)])));
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "不存在" } });
    expect(screen.getByText("没有匹配的规则")).toBeInTheDocument();
    expect(screen.queryByText("还没有网络规则")).not.toBeInTheDocument();
  });

  it("应用失败时在表格上方显示横幅并可重试", async () => {
    const current = snapshot([rule(1)]);
    current.apply = {
      state: "error",
      code: "dnr_apply_failed",
      desiredRevision: 3,
      lastAppliedRevision: 2,
      message: "Rule limit exceeded",
    };
    const client = clientFor(current, {
      retryApply: vi.fn().mockResolvedValue({ ...snapshot([rule(1)]), outcome: "applied" as const }),
    });
    renderPage(client);

    expect(await screen.findByText("规则未能应用到浏览器")).toBeInTheDocument();
    expect(screen.getByText(/Rule limit exceeded/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await flush();
    expect(client.retryApply).toHaveBeenCalled();
  });
});
