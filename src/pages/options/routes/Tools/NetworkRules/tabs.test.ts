import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetworkRuleCondition } from "@App/app/repo/network_rule";
import { reloadRuleTabs } from "./tabs";

const query = vi.fn();
const reload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue([]);
  reload.mockResolvedValue(undefined);
  Object.assign(chrome.tabs, { query, reload });
});
afterEach(() => vi.restoreAllMocks());

function patternsOf(): string[] {
  return (query.mock.calls[0][0] as chrome.tabs.QueryInfo).url as string[];
}

describe("保存成功后的刷新标签页", () => {
  it("只查规则域名及其子域名的标签，不按窗口把当前页一起刷掉", async () => {
    const condition: NetworkRuleCondition = { requestDomains: ["example.com"] };
    query.mockResolvedValue([{ id: 7 }, { id: 9 }]);

    await reloadRuleTabs([condition]);

    expect(patternsOf()).toEqual(["*://example.com/*", "*://*.example.com/*"]);
    // active / currentWindow 都不该出现：范围由规则本身决定，而不是由哪个窗口在前台决定。
    expect(query.mock.calls[0][0]).toEqual({ url: ["*://example.com/*", "*://*.example.com/*"] });
    expect(reload.mock.calls.map((call) => call[0])).toEqual([7, 9]);
  });

  it("多条规则的域名合并去重", async () => {
    await reloadRuleTabs([{ requestDomains: ["a.com", "b.com"] }, { requestDomains: ["b.com"] }]);

    expect(patternsOf()).toEqual(["*://a.com/*", "*://*.a.com/*", "*://b.com/*", "*://*.b.com/*"]);
  });

  it("「所有网站」规则无从收窄，回落到全部网页标签", async () => {
    await reloadRuleTabs([{ requestDomains: ["a.com"] }, { urlFilter: "*" }]);

    expect(patternsOf()).toEqual(["http://*/*", "https://*/*"]);
  });

  it("拿不到 id 的标签跳过，不会用 undefined 去调用 reload", async () => {
    query.mockResolvedValue([{ id: undefined }, { id: 3 }]);

    await reloadRuleTabs([{ requestDomains: ["a.com"] }]);

    expect(reload.mock.calls.map((call) => call[0])).toEqual([3]);
  });
});
