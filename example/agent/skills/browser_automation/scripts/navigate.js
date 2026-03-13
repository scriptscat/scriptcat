// ==CATTool==
// @name         navigate
// @description  Navigate a tab to the specified URL. Returns the final URL and tabId after navigation.
// @param        url string [required] Target URL (must start with http:// or https://)
// @param        tabId number Target tab ID (defaults to the active tab)
// @param        waitUntil boolean Whether to wait for page load to complete (default: true)
// @grant        CAT.agent.dom
// ==/CATTool==

try {
  // URL 格式校验
  const url = args.url;
  if (!url || typeof url !== "string") {
    return { success: false, error: "缺少必要参数: url" };
  }
  // 简单校验 URL 格式
  if (!/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url)) {
    return { success: false, error: `URL 格式不正确（需要以 http:// 或 https:// 开头）: ${url}` };
  }

  const options = {};
  if (args.tabId != null) options.tabId = args.tabId;
  if (args.waitUntil != null) options.waitUntil = args.waitUntil;

  const result = await CAT.agent.dom.navigate(url, options);
  return { success: true, url: result.url || url, tabId: result.tabId };
} catch (e) {
  const msg = e.message || String(e);
  if (/chrome:\/\/|edge:\/\/|about:/i.test(msg)) {
    return { success: false, error: "无法导航到浏览器内部页面（chrome://、edge:// 等）" };
  }
  if (/timeout/i.test(msg)) {
    return { success: false, error: `导航超时: ${args.url}` };
  }
  return { success: false, error: `导航失败: ${msg}` };
}
