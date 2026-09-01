import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithThemeRouter } from "@Tests/renderWithThemeRouter";
import { notify } from "@App/pages/components/ui/toast";
import { cspRemovalAction, type NetworkRule } from "@App/app/repo/network_rule";
import type { NetworkRuleClient } from "@App/app/service/service_worker/client";
import type { NetworkRuleSnapshot } from "@App/app/service/service_worker/network_rule";

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

function snapshot(rules: NetworkRule[], order = rules.map((r) => r.id)): NetworkRuleSnapshot {
  return {
    state: { schemaVersion: 1, revision: 3, masterEnabled: true, rules, order },
    apply: { state: "applied", revision: 3, appliedAt: 1 },
  };
}

function clientFor(current: NetworkRuleSnapshot, overrides: Partial<NetworkRuleClient> = {}): NetworkRuleClient {
  const mutated = {
    state: { ...current.state, revision: current.state.revision + 1 },
    apply: { state: "applied" as const, revision: current.state.revision + 1, appliedAt: 2 },
    outcome: "applied" as const,
  };
  return {
    getState: vi.fn().mockResolvedValue(current),
    createRule: vi.fn().mockResolvedValue(mutated),
    updateRule: vi.fn().mockResolvedValue(mutated),
    deleteRules: vi.fn().mockResolvedValue(mutated),
    setRulesEnabled: vi.fn(),
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
    // 只有第二页存在时「跨页」才成立，刚好多出一条即可；多余的行只会让整页渲染更贵。
    const total = NETWORK_RULES_PAGE_SIZE + 1;
    const offPage = total - 1;
    const rules = Array.from({ length: total }, (_, index) => rule(index));
    const client = clientFor(snapshot(rules));
    renderPage(client);
    expect(await screen.findByText("规则 0")).toBeInTheDocument();
    expect(screen.getAllByTestId("network-rule-row")).toHaveLength(NETWORK_RULES_PAGE_SIZE);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: `规则 ${offPage}` } });
    const row = screen.getAllByTestId("network-rule-row")[0];
    expect(rowNames()).toEqual([`规则 ${offPage}`]);
    expect(within(row).getByRole("button", { name: new RegExp(`规则 ${offPage}`) })).toBeDisabled();

    await openRowMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: "置顶" }));
    await flush();

    const order = vi.mocked(client.reorderRules).mock.calls[0][0].order;
    expect(order).toHaveLength(total);
    expect(order[0]).toBe(`r${offPage}`);
  });

  it("清除筛选后恢复完整列表，手柄重新可用", async () => {
    // 筛掉一部分再清掉筛选就足以验证恢复，不需要凑满一整页。
    renderPage(clientFor(snapshot([rule(1), rule(2), rule(3)])));
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "规则 2" } });
    expect(rowNames()).toEqual(["规则 2"]);

    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(rowNames()).toEqual(["规则 1", "规则 2", "规则 3"]);
    expect(
      within(screen.getAllByTestId("network-rule-row")[0]).getByRole("button", { name: /规则 1/ })
    ).not.toBeDisabled();
  });

  it("行菜单可以把规则移到指定位置", async () => {
    // 目标位次落在中间，才和「置顶／置底」区分开；四行就够摆出这样一个位次。
    const client = clientFor(snapshot([rule(1), rule(2), rule(3), rule(4)]));
    renderPage(client);
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    await openRowMenu(screen.getAllByTestId("network-rule-row")[0]);
    fireEvent.click(await screen.findByRole("menuitem", { name: "移到…" }));
    fireEvent.change(await screen.findByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "移动" }));
    await flush();

    const order = vi.mocked(client.reorderRules).mock.calls[0][0].order;
    expect(order).toEqual(["r2", "r3", "r1", "r4"]);
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

const TEMPLATE_NAMES = [
  "移除 CSP",
  "修改 User-Agent",
  "修改 Referer",
  "修改响应头",
  "屏蔽请求",
  "重定向请求",
  "自定义",
];

async function openCreateSheet() {
  fireEvent.click(screen.getByRole("button", { name: "新建规则" }));
  await flush();
}

async function pickTemplate(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(name) }));
  await flush();
}

async function pickOption(comboboxName: string, optionText: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: comboboxName }), { key: "Enter" });
  await flush();
  fireEvent.click(await screen.findByRole("option", { name: optionText }));
  await flush();
}

async function openRowAction(row: HTMLElement, item: string) {
  await openRowMenu(row);
  fireEvent.click(await screen.findByRole("menuitem", { name: item }));
  await flush();
}

describe("网络规则编辑抽屉", () => {
  it("新建规则先展示七个场景模板", async () => {
    renderPage(clientFor(snapshot([])));
    expect(await screen.findByText("还没有网络规则")).toBeInTheDocument();

    await openCreateSheet();

    for (const name of TEMPLATE_NAMES) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it("改写 Cookie 请求头在输入阶段就被拦下，保存不会发出任何请求", async () => {
    const client = clientFor(snapshot([]));
    renderPage(client);
    expect(await screen.findByText("还没有网络规则")).toBeInTheDocument();

    await openCreateSheet();
    await pickTemplate("自定义");
    await pickOption("动作类型", "改请求头");
    fireEvent.change(screen.getByLabelText("应用范围"), { target: { value: "example.com" } });
    fireEvent.change(screen.getAllByLabelText("头名称")[0], { target: { value: "Cookie" } });

    // 黑名单说明常驻在这一栏，所以这里要认的是报错本身，而不是页面上出现了这几个字。
    expect(screen.getByRole("alert")).toHaveTextContent("会暴露或伪造调用者身份");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await flush();
    expect(client.createRule).not.toHaveBeenCalled();
  });

  it("移除 CSP 模板预填四个 CSP 响应头，X-Frame-Options 可选附带", async () => {
    const client = clientFor(snapshot([]));
    renderPage(client);
    expect(await screen.findByText("还没有网络规则")).toBeInTheDocument();

    await openCreateSheet();
    await pickTemplate("移除 CSP");
    for (const header of [
      "content-security-policy",
      "content-security-policy-report-only",
      "x-content-security-policy",
      "x-webkit-csp",
    ]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
    expect(screen.queryByText("x-frame-options")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "同时移除 X-Frame-Options" }));
    fireEvent.change(screen.getByLabelText("应用范围"), { target: { value: "github.com" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await flush();

    expect(client.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        condition: expect.objectContaining({ requestDomains: ["github.com"] }),
        action: {
          type: "removeResponseHeaders",
          headers: [
            "content-security-policy",
            "content-security-policy-report-only",
            "x-content-security-policy",
            "x-webkit-csp",
            "x-frame-options",
          ],
        },
      })
    );
  });

  it("编辑既有规则直接进入第二步，更换类型退回第一步并保留应用范围", async () => {
    const client = clientFor(snapshot([rule(1)]));
    renderPage(client);
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    await openRowAction(screen.getAllByTestId("network-rule-row")[0], "编辑");
    expect(screen.getByLabelText("应用范围")).toHaveValue("s1.example.com");
    expect(screen.queryByRole("button", { name: /屏蔽请求/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "更换类型" }));
    await flush();
    for (const name of TEMPLATE_NAMES) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
    }

    await pickTemplate("屏蔽请求");
    expect(screen.getByLabelText("应用范围")).toHaveValue("s1.example.com");

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await flush();
    expect(client.updateRule).toHaveBeenCalledWith(
      expect.objectContaining({ id: "r1", patch: expect.objectContaining({ action: { type: "block" } }) })
    );
  });

  it("排除域名超过单条规则上限时挡下保存并说明原因", async () => {
    const client = clientFor(snapshot([]));
    renderPage(client);
    expect(await screen.findByText("还没有网络规则")).toBeInTheDocument();

    await openCreateSheet();
    await pickTemplate("屏蔽请求");
    fireEvent.change(screen.getByLabelText("应用范围"), { target: { value: "example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "高级选项" }));
    fireEvent.change(await screen.findByLabelText("排除域名"), {
      target: { value: Array.from({ length: 101 }, (_, index) => `d${index}.example.com`).join("\n") },
    });

    expect(screen.getByText("每条规则请输入 1 至 100 个域名。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await flush();
    expect(client.createRule).not.toHaveBeenCalled();
  });

  it("保存「所有网站」规则前必须二次确认", async () => {
    const client = clientFor(snapshot([]));
    renderPage(client);
    expect(await screen.findByText("还没有网络规则")).toBeInTheDocument();

    await openCreateSheet();
    await pickTemplate("屏蔽请求");
    fireEvent.click(screen.getByRole("checkbox", { name: /所有网站/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await flush();

    expect(client.createRule).not.toHaveBeenCalled();
    expect(screen.getByText("影响所有网站？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    await flush();
    expect(client.createRule).toHaveBeenCalledWith(
      expect.objectContaining({ condition: expect.objectContaining({ urlFilter: "*" }) })
    );
  });

  it("删除规则需确认，并提示可以改用停用", async () => {
    const client = clientFor(snapshot([rule(1)]));
    renderPage(client);
    expect(await screen.findByText("规则 1")).toBeInTheDocument();

    await openRowAction(screen.getAllByTestId("network-rule-row")[0], "删除");
    expect(client.deleteRules).not.toHaveBeenCalled();
    expect(screen.getByText(/停用/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除规则" }));
    await flush();
    expect(client.deleteRules).toHaveBeenCalledWith({ baseRevision: 3, ids: ["r1"] });
  });
});

describe("网络规则配额提示", () => {
  const mixedRules = [
    rule(1, { action: { type: "block" } }),
    rule(2, { action: { type: "redirect", url: "https://example.com/x.js" } }),
    rule(3, { action: { type: "allow" } }),
    rule(4, { action: cspRemovalAction() }),
    rule(5, { action: { type: "block" }, enabled: false }),
  ];

  it("按动作类型分别提示占用：block 走总池，改头/重定向/放行另占 unsafe 池", async () => {
    renderPage(clientFor(snapshot(mixedRules)));
    const quota = await screen.findByTestId("network-rules-quota");

    // 停用的规则不会被编译成 DNR 规则，因此不占配额：总池 4 条，其中 3 条是 unsafe。
    expect(quota).toHaveTextContent(`4/${chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES}`);
    expect(quota).toHaveTextContent(`3/${chrome.declarativeNetRequest.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES}`);
  });

  it("浏览器不区分 unsafe 池时只提示总池，且数字仍取自运行时常量", async () => {
    // Firefox 不实现 safe/unsafe 分池，两个 Chrome 专属常量在那里根本不存在。
    const absent = ["MAX_NUMBER_OF_DYNAMIC_RULES", "MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES"] as const;
    const saved = absent.map((name) => chrome.declarativeNetRequest[name]);
    for (const name of absent) {
      Object.defineProperty(chrome.declarativeNetRequest, name, { value: undefined, configurable: true });
    }
    try {
      renderPage(clientFor(snapshot(mixedRules)));
      const quota = await screen.findByTestId("network-rules-quota");
      expect(quota).toHaveTextContent(`4/${chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES}`);
      expect(quota.textContent).not.toContain("3/");
    } finally {
      absent.forEach((name, index) =>
        Object.defineProperty(chrome.declarativeNetRequest, name, { value: saved[index], configurable: true })
      );
    }
  });
});
