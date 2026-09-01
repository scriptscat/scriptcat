import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithThemeRouter } from "@Tests/renderWithThemeRouter";
import { NetworkRuleAmbiguousResponseError, type NetworkRuleClient } from "@App/app/service/service_worker/client";
import { cspRemovalAction, type NetworkRule } from "@App/app/repo/network_rule";
import type { NetworkRuleSnapshot } from "@App/app/service/service_worker/network_rule";
import { extensionEnv } from "@App/app/service/extension/extension_env";
import { NetworkRulesSection } from "./NetworkRulesSection";

beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => {
  mockMatchMedia();
  vi.clearAllMocks();
});
afterEach(() => {
  extensionEnv.inIncognitoContext = false;
  extensionEnv.incognitoMode = "split";
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
    updatedAt: index,
    ...over,
  };
}

function snapshot(rules: NetworkRule[], over: Partial<NetworkRuleSnapshot> = {}): NetworkRuleSnapshot {
  return {
    state: { schemaVersion: 1, revision: 1, masterEnabled: true, rules, order: rules.map((r) => r.id) },
    apply: { state: "applied", revision: 1, appliedAt: 1 },
    ...over,
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
    reorderRules: vi.fn(),
    retryApply: vi.fn(),
    ...overrides,
  } as unknown as NetworkRuleClient;
}

function renderCard(client: NetworkRuleClient) {
  return renderWithThemeRouter(
    <Routes>
      <Route path="/tools" element={<NetworkRulesSection register={() => () => {}} client={client} />} />
      <Route path="/tools/network-rules" element={<p>{"规则列表页"}</p>} />
    </Routes>,
    { initialEntries: ["/tools"] }
  );
}

function manyRules(count: number): NetworkRule[] {
  return Array.from({ length: count }, (_, index) => rule(index));
}

describe("Tools 网络规则摘要卡", () => {
  it("规则数从 3 条涨到 50 条，卡片结构不变——预览恒为两条，高度不随规则数增长", async () => {
    const small = renderCard(clientFor(snapshot(manyRules(3))));
    await screen.findByTestId("network-rules-summary");
    const smallCard = screen.getByTestId("network-rules-summary");
    const smallNodes = smallCard.querySelectorAll("*").length;
    expect(screen.getAllByTestId("network-rules-preview-row")).toHaveLength(2);
    small.unmount();

    renderCard(clientFor(snapshot(manyRules(50))));
    await screen.findByTestId("network-rules-summary");
    expect(screen.getAllByTestId("network-rules-preview-row")).toHaveLength(2);
    expect(screen.getByTestId("network-rules-summary").querySelectorAll("*").length).toBe(smallNodes);
  });

  it("摘要卡不承载增删改：没有新建/编辑/删除入口，也没有逐条的启用开关", async () => {
    renderCard(clientFor(snapshot(manyRules(3))));
    await screen.findByTestId("network-rules-summary");

    for (const name of ["新建规则", "编辑", "删除", "更多操作"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.getByRole("switch")).toHaveAccessibleName("总开关");
  });

  it("预览显示最近修改的两条规则与其余条数", async () => {
    renderCard(clientFor(snapshot(manyRules(5))));
    await screen.findByTestId("network-rules-summary");
    const names = screen.getAllByTestId("network-rules-preview-row").map((row) => row.textContent ?? "");
    expect(names[0]).toContain("规则 4");
    expect(names[1]).toContain("规则 3");
    expect(screen.getByText("另有 3 条…")).toBeInTheDocument();
  });

  it("「管理规则」是进入 /tools/network-rules 的入口", async () => {
    renderCard(clientFor(snapshot(manyRules(3))));
    await screen.findByTestId("network-rules-summary");
    fireEvent.click(screen.getByRole("button", { name: "管理规则" }));
    expect(await screen.findByText("规则列表页")).toBeInTheDocument();
  });

  it("「测试匹配」打开纯前端模拟对话框", async () => {
    renderCard(clientFor(snapshot(manyRules(3))));
    await screen.findByTestId("network-rules-summary");
    fireEvent.click(screen.getByRole("button", { name: "测试匹配" }));
    expect(await screen.findByLabelText("网址")).toBeInTheDocument();
  });

  it("加载中显示骨架而不是规则", () => {
    let resolve: (value: NetworkRuleSnapshot) => void = () => {};
    const client = clientFor(snapshot([]), {
      getState: vi.fn(() => new Promise<NetworkRuleSnapshot>((r) => (resolve = r))),
    } as unknown as Partial<NetworkRuleClient>);
    renderCard(client);
    expect(screen.getByTestId("network-rules-loading")).toBeInTheDocument();
    resolve(snapshot([]));
  });

  it("空态说明还没有规则", async () => {
    renderCard(clientFor(snapshot([])));
    expect(await screen.findByText("还没有网络规则")).toBeInTheDocument();
    expect(screen.getByText("0 条启用中 · 共 0 条规则")).toBeInTheDocument();
  });

  it("应用失败时保留已保存的规则并提供重试", async () => {
    const failed = snapshot(manyRules(3), {
      apply: { state: "error", code: "dnr_apply_failed", desiredRevision: 1, message: "Rule limit exceeded" },
    });
    const retryApply = vi.fn().mockResolvedValue({ ...snapshot(manyRules(3)), outcome: "applied" });
    renderCard(clientFor(failed, { retryApply } as unknown as Partial<NetworkRuleClient>));

    expect(await screen.findByText("规则未能应用到浏览器")).toBeInTheDocument();
    expect(screen.getByText("未生效")).toBeInTheDocument();
    expect(screen.getAllByTestId("network-rules-preview-row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(retryApply).toHaveBeenCalled());
  });

  it("总开关关闭时规则保留并置灰", async () => {
    renderCard(clientFor(snapshot(manyRules(3), { state: { ...snapshot(manyRules(3)).state, masterEnabled: false } })));
    expect(await screen.findByText("所有规则已暂停")).toBeInTheDocument();
    expect(screen.getByText("已暂停")).toBeInTheDocument();
    expect(screen.getByTestId("network-rules-preview")).toHaveClass("opacity-60");
    expect(screen.getAllByTestId("network-rules-preview-row")).toHaveLength(2);
  });

  it("隐身上下文与普通窗口一视同仁：照常读取状态、可管理，且没有隐身提示", async () => {
    extensionEnv.inIncognitoContext = true;
    const client = clientFor(snapshot(manyRules(3)));
    renderCard(client);
    expect(await screen.findByTestId("network-rules-summary")).toBeInTheDocument();
    expect(client.getState).toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "总开关" })).toBeInTheDocument();
    expect(screen.queryByText(/请在普通窗口中管理网络规则/)).toBeNull();
  });

  it("总开关关闭时测试匹配照常给出命中，并说明规则被暂停", async () => {
    const paused = snapshot(manyRules(3));
    paused.state.masterEnabled = false;
    renderCard(clientFor(paused));
    await screen.findByTestId("network-rules-summary");

    fireEvent.click(screen.getByRole("button", { name: "测试匹配" }));
    fireEvent.change(await screen.findByLabelText("网址"), { target: { value: "https://s1.example.com/page" } });

    expect(screen.getAllByTestId("match-test-hit")).toHaveLength(1);
    expect(screen.getByTestId("match-test-outcome")).not.toHaveTextContent("无命中");
    expect(within(screen.getByRole("dialog")).getByText(/总开关已关闭/)).toBeInTheDocument();
  });

  it("总开关写入失败时提示且不改动本地状态", async () => {
    const setMasterEnabled = vi.fn().mockRejectedValue(new NetworkRuleAmbiguousResponseError());
    renderCard(clientFor(snapshot(manyRules(3)), { setMasterEnabled } as unknown as Partial<NetworkRuleClient>));
    await screen.findByTestId("network-rules-summary");
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(setMasterEnabled).toHaveBeenCalled());
    expect(screen.getByRole("switch")).toBeChecked();
  });
});
