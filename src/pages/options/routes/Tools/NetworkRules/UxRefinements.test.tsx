import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithThemeRouter } from "@Tests/renderWithThemeRouter";
import { cspRemovalAction, type NetworkRule, type NetworkRuleState } from "@App/app/repo/network_rule";
import type { NetworkRuleClient } from "@App/app/service/service_worker/client";
import type { NetworkRuleMutationResult } from "@App/app/service/service_worker/network_rule";

const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("@App/pages/components/ui/toast", () => ({ notify }));

import NetworkRules from ".";

beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => {
  mockMatchMedia();
  vi.clearAllMocks();
  Object.assign(chrome.tabs, { query: vi.fn().mockResolvedValue([]), reload: vi.fn().mockResolvedValue(undefined) });
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

function clientFor(rules: NetworkRule[], overrides: Partial<NetworkRuleClient> = {}): NetworkRuleClient {
  let state: NetworkRuleState = {
    schemaVersion: 1,
    revision: 3,
    masterEnabled: true,
    rules,
    order: rules.map((r) => r.id),
  };
  const snapshot = () => ({ state, apply: { state: "applied" as const, revision: state.revision, appliedAt: 1 } });
  const commit = (next: Partial<NetworkRuleState>): NetworkRuleMutationResult => {
    state = { ...state, ...next, revision: state.revision + 1 };
    return { ...snapshot(), outcome: "applied" as const };
  };
  return {
    getState: vi.fn(async () => snapshot()),
    createRule: vi.fn(),
    updateRule: vi.fn(),
    setMasterEnabled: vi.fn(),
    reorderRules: vi.fn(),
    retryApply: vi.fn(),
    setRuleEnabled: vi.fn(async ({ id, enabled }: { id: string; enabled: boolean }) =>
      commit({ rules: state.rules.map((r) => (r.id === id ? { ...r, enabled } : r)) })
    ),
    deleteRule: vi.fn(async ({ id }: { id: string }) =>
      commit({ rules: state.rules.filter((r) => r.id !== id), order: state.order.filter((o) => o !== id) })
    ),
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

describe("网络规则批量操作的进度与部分失败", () => {
  it("逐条推进时显示进度，全部成功后进度消失", async () => {
    const rules = [rule(1), rule(2), rule(3)];
    const gates: Array<() => void> = [];
    const client = clientFor(rules, {
      // 每次调用挂起，由测试逐个放行，才能在中途读到进度。
      setRuleEnabled: vi.fn(
        () =>
          new Promise<NetworkRuleMutationResult>((resolve) => {
            const revision = 3 + gates.length + 1;
            gates.push(() =>
              resolve({
                state: { schemaVersion: 1, revision, masterEnabled: true, rules, order: rules.map((r) => r.id) },
                apply: { state: "applied", revision, appliedAt: 1 },
                outcome: "applied",
              } as NetworkRuleMutationResult)
            );
          })
      ),
    });
    renderPage(client);
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "选择 规则 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 规则 2" }));
    fireEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "停用" }));
    await flush();

    expect(screen.getByText("处理中 0 / 2")).toBeInTheDocument();
    await act(async () => gates[0]());
    expect(screen.getByText("处理中 1 / 2")).toBeInTheDocument();
    await act(async () => gates[1]());
    await flush();
    expect(screen.queryByText(/处理中/)).not.toBeInTheDocument();
  });

  it("中途失败时说清已改了几条、其余未动，而不是只报一句失败", async () => {
    let calls = 0;
    const client = clientFor([rule(1), rule(2), rule(3)], {
      deleteRule: vi.fn(async () => {
        calls += 1;
        if (calls === 2) throw new Error("boom");
        return {
          state: { schemaVersion: 1, revision: 3 + calls, masterEnabled: true, rules: [], order: [] },
          apply: { state: "applied", revision: 3 + calls, appliedAt: 1 },
          outcome: "applied",
        } as NetworkRuleMutationResult;
      }),
    });
    renderPage(client);
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    for (const name of ["规则 1", "规则 2", "规则 3"]) {
      fireEvent.click(screen.getByRole("checkbox", { name: `选择 ${name}` }));
    }
    fireEvent.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "删除" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "删除规则" }));
    await flush();

    expect(notify.error).toHaveBeenCalledWith(expect.any(String), {
      description: "已完成 1 条，共 3 条；其余未改动。",
    });
    expect(notify.success).not.toHaveBeenCalled();
  });
});

describe("网络规则空态", () => {
  it("给出常用场景入口，点一下直接进到该场景的表单", async () => {
    renderPage(clientFor([]));
    expect(await screen.findByText("从一个常用场景开始，或自己新建一条")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "移除 CSP" }));
    await flush();

    const sheet = screen.getByRole("dialog");
    // 直接落在第二步：场景徽标已经是「移除 CSP」，不需要用户再选一次。
    expect(within(sheet).getByText("更换类型")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("应用范围")).toBeInTheDocument();
  });
});

describe("网络规则筛选横幅", () => {
  it("说明手柄为什么灰掉，而不只报匹配条数", async () => {
    renderPage(clientFor([rule(1), rule(2)]));
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "规则 1" } });

    const banner = screen.getByText(/筛选中/).closest("[role='status']");
    expect(banner).toHaveTextContent("匹配 1 条");
    expect(banner).toHaveTextContent("排序需要完整列表，已暂时停用拖拽");
  });
});

describe("网络规则编辑抽屉的「试一试」", () => {
  // 空态的场景入口直接落到第二步，正好省去先选模板这一步。
  async function openTemplate(name: string) {
    renderPage(clientFor([]));
    fireEvent.click(await screen.findByRole("button", { name }));
    await flush();
  }

  it("命中时说明会发生什么，而不只是「匹配」两个字", async () => {
    await openTemplate("移除 CSP");
    fireEvent.change(screen.getByLabelText("应用范围"), { target: { value: "example.com" } });
    fireEvent.change(screen.getByLabelText("试一试"), { target: { value: "https://example.com/page" } });

    expect(screen.getByText("匹配 · 将移除 4 个响应头")).toBeInTheDocument();
  });

  it("屏蔽请求场景说明请求会被屏蔽", async () => {
    await openTemplate("屏蔽请求");
    fireEvent.change(screen.getByLabelText("应用范围"), { target: { value: "example.com" } });
    fireEvent.change(screen.getByLabelText("试一试"), { target: { value: "https://example.com/page" } });

    expect(screen.getByText("匹配 · 将屏蔽该请求")).toBeInTheDocument();
  });

  it("范围命中但资源类型不含主文档时，说明这次导航不会被规则作用", async () => {
    await openTemplate("屏蔽请求");
    const sheet = screen.getByRole("dialog");
    fireEvent.change(screen.getByLabelText("应用范围"), { target: { value: "example.com" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "高级选项" }));
    await flush();
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "image" }));
    fireEvent.change(screen.getByLabelText("试一试"), { target: { value: "https://example.com/page" } });

    expect(
      screen.getByText("网址在范围内，但「高级选项」里限定的资源类型或请求方法不覆盖这次测试的主文档 GET 请求。")
    ).toBeInTheDocument();
  });
});

describe("网络规则的请求头黑名单", () => {
  it("在输入之前就常驻说明哪些请求头不能改写", async () => {
    renderPage(clientFor([]));
    fireEvent.click(await screen.findByRole("button", { name: "自定义" }));
    await flush();

    // 「自定义」默认动作是屏蔽请求，没有请求头可填，说明也就不该出现。
    expect(screen.queryByText(/不允许改写/)).not.toBeInTheDocument();

    // Radix Select 在 happy-dom 下靠键盘打开，与 index.test.tsx 的 pickOption 一致。
    fireEvent.keyDown(screen.getByRole("combobox", { name: "动作类型" }), { key: "Enter" });
    await flush();
    fireEvent.click(await screen.findByRole("option", { name: "改请求头" }));
    await flush();

    expect(screen.getByText("Cookie、Authorization、Host、Origin 不允许改写。")).toBeInTheDocument();
  });
});
