import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithThemeRouter } from "@Tests/renderWithThemeRouter";
import { cspRemovalAction, type NetworkRule } from "@App/app/repo/network_rule";
import type { NetworkRuleClient } from "@App/app/service/service_worker/client";
import type { NetworkRuleSnapshot } from "@App/app/service/service_worker/network_rule";
import { parseRuleDomains } from "@App/pkg/utils/network_rule_condition";

import NetworkRules from ".";
import RuleForm, { type RuleFormState } from "./RuleForm";
import RuleSheet from "./RuleSheet";
import { ACTION_TONES } from "./RuleParts";
import { emptyActionDraft } from "./templates";
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

function rule(id: string, name: string, action: NetworkRule["action"]): NetworkRule {
  return {
    id,
    name,
    enabled: true,
    condition: { requestDomains: ["example.com"] },
    action,
    createdAt: 1,
    updatedAt: 1,
  };
}

function renderPage(rules: NetworkRule[]) {
  const snapshot: NetworkRuleSnapshot = {
    state: { schemaVersion: 1, revision: 3, masterEnabled: true, rules, order: rules.map((r) => r.id) },
    apply: { state: "applied", revision: 3, appliedAt: 1 },
  };
  renderWithThemeRouter(
    <Routes>
      <Route
        path="/tools/network-rules"
        element={
          <NetworkRules client={{ getState: vi.fn().mockResolvedValue(snapshot) } as unknown as NetworkRuleClient} />
        }
      />
    </Routes>,
    { initialEntries: ["/tools/network-rules"] }
  );
}

/** 模板卡的图标片是按钮的第一个子元素，颜色只落在它身上，标题与描述用的是通用文字色。 */
function templateIcon(title: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(title) }).firstElementChild as HTMLElement;
}

describe("网络规则的动作配色", () => {
  it("六种动作各有一种颜色，且都取自 label-* 令牌族的同一色相", () => {
    const tones = Object.values(ACTION_TONES);

    expect(tones).toHaveLength(6);
    expect(new Set(tones).size).toBe(6);
    for (const tone of tones) {
      const hues = /^bg-label-([a-z]+)-bg text-label-([a-z]+)-fg$/.exec(tone);
      expect(hues, tone).not.toBeNull();
      expect(hues![1]).toBe(hues![2]);
    }
  });

  it("列表页的动作徽标按动作类型上色，而不是一律中性", async () => {
    renderPage([
      rule("r1", "移除 CSP", cspRemovalAction()),
      rule("r2", "屏蔽上报", { type: "block" }),
      rule("r3", "改 UA", {
        type: "modifyRequestHeaders",
        headers: [{ header: "user-agent", operation: "set", value: "x" }],
      }),
    ]);

    expect((await screen.findByText("移除响应头")).className).toContain(ACTION_TONES.removeResponseHeaders);
    expect(screen.getByText("屏蔽").className).toContain(ACTION_TONES.block);
    expect(screen.getByText("改请求头").className).toContain(ACTION_TONES.modifyRequestHeaders);
    expect(screen.getByText("屏蔽").className).not.toContain("bg-secondary");
  });

  it("选模板卡片的图标片取该模板动作的颜色，「自定义」没有固定动作因而保持中性", () => {
    render(<RuleSheet open saving={false} onOpenChange={() => {}} onSave={async () => true} />);

    expect(templateIcon("移除 CSP").className).toContain(ACTION_TONES.removeResponseHeaders);
    expect(templateIcon("修改 User-Agent").className).toContain(ACTION_TONES.modifyRequestHeaders);
    expect(templateIcon("修改 Referer").className).toContain(ACTION_TONES.modifyRequestHeaders);
    expect(templateIcon("修改响应头").className).toContain(ACTION_TONES.modifyResponseHeaders);
    expect(templateIcon("屏蔽请求").className).toContain(ACTION_TONES.block);
    expect(templateIcon("重定向请求").className).toContain(ACTION_TONES.redirect);
    expect(templateIcon("自定义").className).toContain("bg-muted");
  });

  it("表单里的动作徽标与被移除的响应头名用同一个动作色", () => {
    const state: RuleFormState = {
      websites: "example.com",
      allSites: false,
      name: "",
      draft: emptyActionDraft("csp"),
      resourceTypes: [],
      requestMethods: [],
      excludedWebsites: "",
      tryUrl: "",
    };
    render(
      <RuleForm
        template="csp"
        templateLabel="移除 CSP"
        state={state}
        scope={parseRuleDomains(state.websites)}
        excluded={parseRuleDomains(state.excludedWebsites)}
        actionErrors={{ headers: [] }}
        condition={{ requestDomains: ["example.com"] }}
        touched={false}
        saving={false}
        canSave
        submitError=""
        onChange={() => {}}
        onBlurScope={() => {}}
        onChangeTemplate={() => {}}
        onCancel={() => {}}
        onSubmit={() => {}}
      />
    );

    const tone: string = ACTION_TONES.removeResponseHeaders;
    expect(screen.getByText("移除 CSP").className).toContain(tone);
    expect(screen.getByText("content-security-policy").className).toContain(tone);
    // 应用范围的域名不是动作的一部分，仍是中性 chip。同名文本还出现在范围输入框的 placeholder 上。
    const domainChip = screen.getAllByText("example.com").find((el) => el.dataset.slot === "badge");
    expect(domainChip!.className).not.toContain("label-");
  });
});
