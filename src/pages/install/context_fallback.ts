import { DocumentationSite } from "@App/app/const";

/**
 * 浏览器兼容处理（#1816）：360 X 中，网页以 noopener 新开的标签被 DNR 重定向到安装页后，页面只拿到
 * 不完整的扩展 API（chrome.tabs / chrome.permissions 缺失，读 chrome.storage 报
 * "Invalid context type provided."）。浏览器为何这样分类尚未确认，在本页刷新或原标签重新导航都恢复不了，
 * 由 SW 用 tabs.create 新开的安装页才正常。
 *
 * 因此这种上下文改为转到文档站的安装中间页：SW 的 webNavigation 监听会接住这次导航，备好脚本后新开
 * `?uuid=` 安装页。只有 DNR 产生的 `?url=` 入口会转跳，SW 新建的入口不会再落回这里，不会循环。
 * `url=` 之后的整段原样转交，与安装页读取 `?url=` 的方式一致，脚本地址自带的查询串不会被截断。
 */
export function getIncompleteContextFallbackUrl(search: string, hasTabsApi: boolean): string | undefined {
  if (hasTabsApi) return undefined;
  const urlIdx = search.indexOf("url=");
  if (urlIdx === -1) return undefined;
  return `${DocumentationSite}/docs/script_installation/#url=${search.slice(urlIdx + 4)}`;
}
