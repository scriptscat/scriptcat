import type { NetworkRuleCondition } from "@App/app/repo/network_rule";

const ALL_WEB_PAGES = ["http://*/*", "https://*/*"];

/** requestDomains 覆盖域名本身与它的子域名，两条匹配式缺一不可。 */
function tabPatterns(conditions: NetworkRuleCondition[]): string[] {
  const domains = new Set<string>();
  for (const condition of conditions) {
    // 「所有网站」等没有域名限制的规则对任何页面都可能生效，范围无从收窄。
    if (!condition.requestDomains?.length) return ALL_WEB_PAGES;
    for (const domain of condition.requestDomains) domains.add(domain);
  }
  return [...domains].flatMap((domain) => [`*://${domain}/*`, `*://*.${domain}/*`]);
}

/**
 * DNR 只影响改动之后发出的请求，已打开的页面不会自己变化，所以保存成功要给一个刷新入口。
 * 范围由改动波及的规则域名决定，而不是「每个窗口的当前标签」：后者会刷掉用户正在别的窗口里
 * 填写、与这条规则毫无关系的页面。扩展自身页面不在 http(s) 匹配式内，不会被刷掉。
 */
export async function reloadRuleTabs(conditions: NetworkRuleCondition[]): Promise<void> {
  const tabs = await chrome.tabs.query({ url: tabPatterns(conditions) });
  await Promise.all(tabs.flatMap((tab) => (tab.id === undefined ? [] : [chrome.tabs.reload(tab.id)])));
}
