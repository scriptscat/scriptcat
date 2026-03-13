// ==UserScript==
// @name         DOM API - 标签页管理与导航
// @namespace    https://scriptcat.org/
// @version      0.1.0
// @description  示例：使用 CAT.agent.dom 管理标签页、导航、截图
// @author       ScriptCat
// @background
// @grant        CAT.agent.dom
// @grant        GM_log
// ==/UserScript==

// 示例 1: 列出所有标签页
async function listAllTabs() {
  const tabs = await CAT.agent.dom.listTabs();

  GM_log(`共 ${tabs.length} 个标签页:`);
  for (const tab of tabs) {
    const status = tab.active ? "[活跃]" : tab.discarded ? "[已挂起]" : "";
    GM_log(`  ${status} #${tab.tabId} ${tab.title} — ${tab.url}`);
  }

  return tabs;
}

// 示例 2: 打开新页面并等待加载
async function navigateAndRead(url) {
  GM_log(`导航到: ${url}`);

  // 打开新标签页并等待加载完成
  const nav = await CAT.agent.dom.navigate(url, {
    waitUntil: true,
    timeout: 15000,
  });

  GM_log(`页面加载完成: ${nav.title} (tabId: ${nav.tabId})`);

  // 读取新页面的内容
  const page = await CAT.agent.dom.readPage({
    tabId: nav.tabId,
    mode: "summary",
  });

  GM_log(`页面有 ${page.interactable.length} 个可交互元素, ${page.links.length} 个链接`);
  return nav;
}

// 示例 3: 在指定标签页中导航（复用标签页）
async function navigateInTab(tabId, url) {
  const nav = await CAT.agent.dom.navigate(url, {
    tabId,
    waitUntil: true,
  });

  GM_log(`标签页 #${tabId} 已导航到: ${nav.title}`);
  return nav;
}

// 示例 4: 截图
async function takeScreenshot(tabId) {
  GM_log("正在截图...");

  const dataUrl = await CAT.agent.dom.screenshot({
    tabId,
    quality: 90,
  });

  GM_log(`截图完成，数据长度: ${dataUrl.length} 字符`);
  // dataUrl 是 base64 编码的 JPEG 图片
  // 可以通过 GM_xmlhttpRequest 上传或保存
  return dataUrl;
}

// 示例 5: 多标签页批量操作
async function batchReadTabs() {
  const tabs = await CAT.agent.dom.listTabs();
  // 过滤出 http/https 页面
  const webTabs = tabs.filter((t) => t.url.startsWith("http"));

  GM_log(`准备读取 ${webTabs.length} 个网页标签页`);

  for (const tab of webTabs.slice(0, 5)) {
    try {
      const page = await CAT.agent.dom.readPage({
        tabId: tab.tabId,
        mode: "summary",
        maxLength: 2000,
      });
      GM_log(`#${tab.tabId} [${page.title}] 链接: ${page.links.length}, 交互: ${page.interactable.length}`);
    } catch (e) {
      GM_log(`#${tab.tabId} 读取失败: ${e.message}`);
    }
  }
}

// 运行示例
(async () => {
  await listAllTabs();
  // const nav = await navigateAndRead("https://example.com");
  // await takeScreenshot(nav.tabId);
  // await batchReadTabs();
})();
