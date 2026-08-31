import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithThemeRouter } from "@Tests/renderWithThemeRouter";
import { notify } from "@App/pages/components/ui/toast";
import { cspRemovalAction, type NetworkRule } from "@App/app/repo/network_rule";
import type { NetworkRuleClient } from "@App/app/service/service_worker/client";
import type { NetworkRuleMutationResult, NetworkRuleSnapshot } from "@App/app/service/service_worker/network_rule";
import { extensionEnv } from "@App/app/service/extension/extension_env";

import NetworkRules from ".";
import { stubNotify } from "./test-helpers";

beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => {
  mockMatchMedia();
  vi.clearAllMocks();
  stubNotify();
});
afterEach(() => {
  extensionEnv.inIncognitoContext = false;
  extensionEnv.incognitoMode = "split";
  vi.restoreAllMocks();
  cleanup();
});

function rule(index: number, over: Partial<NetworkRule> = {}): NetworkRule {
  return {
    id: `r${index}`,
    name: `规则 ${index}`,
    enabled: true,
    condition: { requestDomains: [`s${index}.example.com`], resourceTypes: ["main_frame"] },
    action: cspRemovalAction(),
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function snapshot(rules: NetworkRule[], over: Partial<NetworkRuleSnapshot["state"]> = {}): NetworkRuleSnapshot {
  return {
    state: { schemaVersion: 1, revision: 3, masterEnabled: true, rules, order: rules.map((r) => r.id), ...over },
    apply: { state: "applied", revision: 3, appliedAt: 1 },
  };
}

/** 存储写入成功但 DNR 应用失败：这一条既不是纯成功也不是纯失败。 */
function applyFailed(current: NetworkRuleSnapshot, order?: string[]): NetworkRuleMutationResult {
  return {
    state: { ...current.state, revision: current.state.revision + 1, order: order ?? current.state.order },
    apply: {
      state: "error",
      code: "dnr_apply_failed",
      desiredRevision: current.state.revision + 1,
      message: "Rule limit exceeded",
    },
    outcome: "applied",
  } as NetworkRuleMutationResult;
}

function clientFor(current: NetworkRuleSnapshot, overrides: Partial<NetworkRuleClient> = {}): NetworkRuleClient {
  return {
    getState: vi.fn().mockResolvedValue(current),
    createRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRules: vi.fn(),
    setRulesEnabled: vi.fn(),
    setMasterEnabled: vi.fn(),
    reorderRules: vi.fn(),
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

describe("网络规则的成败反馈", () => {
  it("排序保存成功但浏览器未接受时只报失败，不同时弹成功", async () => {
    const current = snapshot([rule(1), rule(2)]);
    const client = clientFor(current, {
      reorderRules: vi.fn(async ({ order }: { order: string[] }) => applyFailed(current, order)),
    } as unknown as Partial<NetworkRuleClient>);
    renderPage(client);
    expect(await screen.findByText("规则 2")).toBeInTheDocument();

    await openRowMenu(screen.getAllByTestId("network-rule-row")[1]);
    fireEvent.click(await screen.findByRole("menuitem", { name: "置顶" }));
    await flush();

    expect(client.reorderRules).toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith("规则已保存，但浏览器规则未能更新。");
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("删除保存成功但浏览器未接受时只报失败，不同时弹成功", async () => {
    const current = snapshot([rule(1)]);
    const client = clientFor(current, {
      deleteRules: vi.fn().mockResolvedValue(applyFailed(current)),
    } as unknown as Partial<NetworkRuleClient>);
    renderPage(client);
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    await openRowMenu(screen.getAllByTestId("network-rule-row")[0]);
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "删除规则" }));
    await flush();

    expect(client.deleteRules).toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith("规则已保存，但浏览器规则未能更新。");
    expect(notify.success).not.toHaveBeenCalled();
  });
});

describe("网络规则列表页的状态指示", () => {
  it("总开关关闭时列表页自己说明规则已暂停", async () => {
    renderPage(clientFor(snapshot([rule(1)], { masterEnabled: false })));
    expect(await screen.findByText("规则 1")).toBeInTheDocument();
    expect(screen.getByText("已暂停")).toBeInTheDocument();
    expect(screen.queryByText("已生效")).toBeNull();
  });

  it("规则应用失败时状态显示未生效", async () => {
    const current = snapshot([rule(1)]);
    current.apply = { state: "error", code: "dnr_apply_failed", desiredRevision: 3, message: "Rule limit exceeded" };
    renderPage(clientFor(current));
    expect(await screen.findByText("规则 1")).toBeInTheDocument();
    expect(screen.getByText("未生效")).toBeInTheDocument();
  });

  it("一切正常时状态显示已生效", async () => {
    renderPage(clientFor(snapshot([rule(1)])));
    expect(await screen.findByText("规则 1")).toBeInTheDocument();
    expect(screen.getByText("已生效")).toBeInTheDocument();
  });

  it("隐身上下文照常渲染规则列表与总开关，且没有隐身提示", async () => {
    extensionEnv.inIncognitoContext = true;
    renderPage(clientFor(snapshot([rule(1)])));
    expect(await screen.findByText("规则 1")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "总开关" })).toBeInTheDocument();
    expect(screen.queryByText(/请在普通窗口中管理网络规则/)).toBeNull();
  });
});

describe("网络规则匹配测试在总开关关闭时", () => {
  it("照常给出命中，并说明规则当前被总开关暂停", async () => {
    renderPage(clientFor(snapshot([rule(1)], { masterEnabled: false })));
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "测试匹配" }));
    fireEvent.change(await screen.findByLabelText("网址"), { target: { value: "https://s1.example.com/page" } });

    expect(screen.getAllByTestId("match-test-hit")).toHaveLength(1);
    expect(screen.getByTestId("match-test-outcome")).not.toHaveTextContent("无命中");
    expect(within(screen.getByRole("dialog")).getByText(/总开关已关闭/)).toBeInTheDocument();
  });
});
