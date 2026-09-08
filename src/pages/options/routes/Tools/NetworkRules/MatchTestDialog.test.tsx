import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { cspRemovalAction, type NetworkRule, type NetworkRuleAction } from "@App/app/repo/network_rule";
import type { NetworkRuleCondition } from "@App/app/repo/network_rule";
import MatchTestDialog from "./MatchTestDialog";

beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => mockMatchMedia());
afterEach(cleanup);

function rule(id: string, condition: NetworkRuleCondition, action: NetworkRuleAction): NetworkRule {
  return { id, name: id, enabled: true, condition, action, createdAt: 1, updatedAt: 1 };
}

const mainFrameGithub: NetworkRuleCondition = { requestDomains: ["github.com"], resourceTypes: ["main_frame"] };
const mainFrameAll: NetworkRuleCondition = { urlFilter: "*", resourceTypes: ["main_frame"] };

function open(rules: NetworkRule[]) {
  render(<MatchTestDialog open rules={rules} onOpenChange={() => {}} />);
  fireEvent.change(screen.getByLabelText("网址"), { target: { value: "https://github.com/scriptscat" } });
}

function hitRows() {
  return screen.getAllByTestId("match-test-hit").map((row) => row.textContent ?? "");
}

describe("测试匹配对话框", () => {
  it("按列表顺序列出命中规则，并标出被靠前 block 短路的规则及原因", () => {
    open([
      rule("移除 GitHub 的 CSP", mainFrameGithub, cspRemovalAction()),
      rule("不相关", { requestDomains: ["example.com"], resourceTypes: ["main_frame"] }, { type: "block" }),
      rule("屏蔽统计上报", mainFrameAll, { type: "block" }),
    ]);

    const rows = hitRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("移除 GitHub 的 CSP");
    expect(rows[0]).toContain("#1");
    expect(rows[0]).toContain("请求已被 #3 屏蔽，不会执行");
    expect(rows[1]).toContain("屏蔽统计上报");
    expect(rows[1]).toContain("#3");
    expect(screen.getByTestId("match-test-outcome")).toHaveTextContent("屏蔽");
  });

  it("标出被靠前 allow 压过的规则及原因", () => {
    open([rule("放行调试接口", mainFrameGithub, { type: "allow" }), rule("屏蔽全部", mainFrameAll, { type: "block" })]);

    const rows = hitRows();
    expect(rows[1]).toContain("顺序更靠前的 #1 已决定结果，不会执行");
    expect(screen.getByTestId("match-test-outcome")).toHaveTextContent("放行");
  });

  it("资源类型改变会改变命中结果", () => {
    open([rule("只改脚本请求", { requestDomains: ["github.com"], resourceTypes: ["script"] }, { type: "block" })]);
    expect(screen.queryAllByTestId("match-test-hit")).toHaveLength(0);

    fireEvent.click(screen.getByLabelText("资源类型"));
    fireEvent.click(screen.getByRole("option", { name: "脚本" }));
    expect(screen.getAllByTestId("match-test-hit")).toHaveLength(1);
  });

  it("完全是前端模拟，不读取浏览器的实际命中记录", () => {
    // ui project 用 isolate: false，chrome mock 由同一 worker 内的所有测试文件共享，用完必须摘掉。
    const getMatchedRules = vi.fn();
    const dnr = chrome.declarativeNetRequest as unknown as Record<string, unknown>;
    dnr.getMatchedRules = getMatchedRules;
    try {
      open([rule("屏蔽全部", mainFrameAll, { type: "block" })]);
      expect(screen.getAllByTestId("match-test-hit")).toHaveLength(1);
      expect(getMatchedRules).not.toHaveBeenCalled();
    } finally {
      delete dnr.getMatchedRules;
    }
  });

  it("地址不合法时提示补全 http(s) 地址且不给结果", () => {
    render(<MatchTestDialog open rules={[]} onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("网址"), { target: { value: "github.com" } });
    expect(screen.getByRole("status")).toHaveTextContent("请输入完整的 http(s) 地址。");
    expect(screen.queryByTestId("match-test-outcome")).toBeNull();
  });

  it("没有规则命中时说明当前规则都不匹配", () => {
    open([rule("别处的规则", { requestDomains: ["example.com"], resourceTypes: ["main_frame"] }, { type: "block" })]);
    expect(screen.getByTestId("match-test-outcome")).toHaveTextContent("无命中");
    expect(within(screen.getByTestId("match-test-outcome")).queryByText("屏蔽")).toBeNull();
  });
});
