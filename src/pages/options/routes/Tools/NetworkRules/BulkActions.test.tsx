import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithThemeRouter } from "@Tests/renderWithThemeRouter";
import { notify } from "@App/pages/components/ui/toast";
import { cspRemovalAction, type NetworkRule, type NetworkRuleState } from "@App/app/repo/network_rule";
import type { NetworkRuleClient } from "@App/app/service/service_worker/client";
import type { NetworkRuleMutationResult } from "@App/app/service/service_worker/network_rule";

import NetworkRules from ".";
import { NETWORK_RULES_PAGE_SIZE } from "./rules";
import { stubNotify } from "./test-helpers";

beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => {
  mockMatchMedia();
  vi.clearAllMocks();
  stubNotify();
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

/** mock 真实地推进 revision 与规则集，批量操作才会暴露「用陈旧 revision」这类错误。 */
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
    setRulesEnabled: vi.fn(async ({ ids, enabled }: { ids: string[]; enabled: boolean }) =>
      commit({ rules: state.rules.map((r) => (ids.includes(r.id) ? { ...r, enabled } : r)) })
    ),
    deleteRules: vi.fn(async ({ ids }: { ids: string[] }) =>
      commit({
        rules: state.rules.filter((r) => !ids.includes(r.id)),
        order: state.order.filter((o) => !ids.includes(o)),
      })
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

// 行勾选框与翻页按钮都按 aria-label 取：整页 role 扫描要给每个同角色元素算一遍可访问名，
// 20 行的表上单次 *ByRole 就要 20~70ms，够把这一文件顶出 ui 项目 850ms 的预算。
function selectRow(name: string) {
  fireEvent.click(screen.getByLabelText(`选择 ${name}`));
}

function bulkBar() {
  return screen.getByRole("toolbar", { name: "批量操作" });
}

function clickBulk(label: string) {
  fireEvent.click(within(bulkBar()).getByRole("button", { name: label }));
}

function argsOf(mock: unknown) {
  return vi
    .mocked(mock as (input: { baseRevision: number; ids: string[]; enabled?: boolean }) => unknown)
    .mock.calls.map((call) => call[0]);
}

describe("网络规则批量操作", () => {
  // 整页挂载 + 两次勾选 + 一次批量往返：本地 solo 覆盖率下 320ms，而 GitHub runner 约慢 2.5 倍，
  // 本文件首例还要多付一次冷启动，850ms 的 ui 预算在 CI 上连挂两轮。给这一条单独放宽，
  // 预算对其余用例保持不变。
  it("未选中时没有操作栏，选中两行后批量停用只对这两条发出请求", { timeout: 1500 }, async () => {
    const client = clientFor([rule(1), rule(2), rule(3)]);
    renderPage(client);
    expect(await screen.findByText("规则 1")).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();

    selectRow("规则 1");
    selectRow("规则 3");
    expect(within(bulkBar()).getByText("已选 2 条")).toBeInTheDocument();

    clickBulk("停用");
    await flush();

    // 一次用户操作只发一次请求：服务端在同一次写入里改完这两条。
    expect(argsOf(client.setRulesEnabled)).toEqual([{ baseRevision: 3, ids: ["r1", "r3"], enabled: false }]);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("批量删除在确认前不动手，确认框提示可以改用停用", async () => {
    const client = clientFor([rule(1), rule(2), rule(3)]);
    renderPage(client);
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    selectRow("规则 1");
    selectRow("规则 3");
    clickBulk("删除");
    await flush();

    expect(client.deleteRules).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("删除选中的 2 条规则？")).toBeInTheDocument();
    expect(within(dialog).getByText(/停用/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "删除规则" }));
    await flush();

    expect(argsOf(client.deleteRules)).toEqual([{ baseRevision: 3, ids: ["r1", "r3"] }]);
    expect(screen.queryByText("规则 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("批量启用只处理当前停用的规则，含「所有网站」时仍需二次确认", async () => {
    const client = clientFor([
      rule(1),
      rule(2, { enabled: false, condition: { urlFilter: "*" } }),
      rule(3, { enabled: false }),
    ]);
    renderPage(client);
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    selectRow("规则 1");
    selectRow("规则 2");
    selectRow("规则 3");
    clickBulk("启用");
    await flush();

    expect(client.setRulesEnabled).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "继续" }));
    await flush();

    expect(argsOf(client.setRulesEnabled)).toEqual([{ baseRevision: 3, ids: ["r2", "r3"], enabled: true }]);
  });

  it("批量删除被拒绝时一条都没删，列表与选中项原样保留", async () => {
    const client = clientFor([rule(1), rule(2), rule(3)], {
      deleteRules: vi.fn().mockRejectedValue({ code: "revision_conflict" }),
    } as unknown as Partial<NetworkRuleClient>);
    renderPage(client);
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    selectRow("规则 1");
    selectRow("规则 2");
    selectRow("规则 3");
    clickBulk("删除");
    await flush();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "删除规则" }));
    await flush();

    // 全体或全不：整批被拒绝时不能有任何一条已经消失。
    expect(client.deleteRules).toHaveBeenCalledTimes(1);
    for (const name of ["规则 1", "规则 2", "规则 3"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(within(bulkBar()).getByText("已选 3 条")).toBeInTheDocument();
    expect(notify.error).toHaveBeenCalledTimes(1);
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("翻页会清空选择，操作栏随之消失", async () => {
    // 刚好多出一条即可翻到第二页，多余的行只会让整表重渲染更贵。
    const client = clientFor(Array.from({ length: NETWORK_RULES_PAGE_SIZE + 1 }, (_, index) => rule(index)));
    renderPage(client);
    expect(await screen.findByText("规则 0")).toBeInTheDocument();

    selectRow("规则 0");
    expect(bulkBar()).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("下一页"));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("改筛选会清空选择，操作栏随之消失", async () => {
    const client = clientFor([rule(1), rule(2), rule(3)]);
    renderPage(client);
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    selectRow("规则 1");
    expect(bulkBar()).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "规则 1" } });
    // 选中的那行仍在筛选结果里，操作栏照样消失，说明清空来自筛选变化而不是该行被过滤掉。
    expect(screen.getByText("规则 1")).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });
});
