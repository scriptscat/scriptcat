// ==UserScript==
// @name         DOM API - 网页自动化流程
// @namespace    https://scriptcat.org/
// @version      0.1.0
// @description  示例：组合使用 CAT.agent.dom 的多个 API 实现完整的网页自动化操作流程
// @author       ScriptCat
// @background
// @grant        CAT.agent.dom
// @grant        GM_log
// ==/UserScript==

// 示例 1: 搜索引擎自动搜索并采集结果
async function searchAndCollect(keyword) {
  GM_log(`开始搜索: ${keyword}`);

  // 1. 打开搜索引擎
  const nav = await CAT.agent.dom.navigate("https://www.bing.com", {
    waitUntil: true,
  });
  const tabId = nav.tabId;

  // 2. 等待搜索框出现
  const waitResult = await CAT.agent.dom.waitFor("#sb_form_q", {
    tabId,
    timeout: 5000,
  });
  if (!waitResult.found) {
    GM_log("搜索框未找到");
    return;
  }

  // 3. 填写搜索关键词
  await CAT.agent.dom.fill("#sb_form_q", keyword, { tabId });
  GM_log("已输入关键词");

  // 4. 点击搜索按钮（使用 trusted 模式模拟真实点击）
  const clickResult = await CAT.agent.dom.click("#sb_form button[type='submit']", {
    tabId,
    trusted: true,
  });
  GM_log(`搜索提交，页面跳转: ${clickResult.navigated}`);

  // 5. 等待搜索结果加载
  await CAT.agent.dom.waitFor("#b_results", { tabId, timeout: 10000 });

  // 6. 读取搜索结果
  const page = await CAT.agent.dom.readPage({
    tabId,
    mode: "detail",
    selector: "#b_results",
    maxLength: 8000,
  });

  GM_log("=== 搜索结果 ===");
  GM_log(page.content);

  return page;
}

// 示例 2: 页面滚动加载 — 读取长页面内容
async function scrollAndCollect(tabId) {
  GM_log("开始滚动采集...");

  const allContent = [];
  let scrollCount = 0;
  const maxScrolls = 5;

  while (scrollCount < maxScrolls) {
    // 读取当前可视区域
    const page = await CAT.agent.dom.readPage({
      tabId,
      mode: "detail",
      viewportOnly: true,
      maxLength: 3000,
    });
    allContent.push(page.content);

    // 向下滚动一屏
    const scrollResult = await CAT.agent.dom.scroll("down", { tabId });
    scrollCount++;

    GM_log(
      `第 ${scrollCount} 次滚动: scrollTop=${scrollResult.scrollTop}, ` +
        `已到底: ${scrollResult.atBottom}`
    );

    // 如果已经到底部，停止滚动
    if (scrollResult.atBottom) {
      GM_log("已到达页面底部");
      break;
    }

    // 等待内容加载（用于懒加载页面）
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const fullContent = allContent.join("\n---\n");
  GM_log(`采集完成，共 ${allContent.length} 段内容，总长度: ${fullContent.length}`);
  return fullContent;
}

// 示例 3: 多页面自动化 — 打开多个链接并采集
async function multiPageCollect(urls) {
  const results = [];

  for (const url of urls) {
    try {
      GM_log(`正在采集: ${url}`);

      const nav = await CAT.agent.dom.navigate(url, { waitUntil: true });

      // 截图存档
      await CAT.agent.dom.screenshot({ tabId: nav.tabId, quality: 70 });

      // 读取页面内容
      const page = await CAT.agent.dom.readPage({
        tabId: nav.tabId,
        mode: "detail",
        maxLength: 5000,
      });

      results.push({
        url: nav.url,
        title: nav.title,
        content: page.content,
        links: page.links.length,
      });

      GM_log(`采集完成: ${nav.title}`);
    } catch (e) {
      GM_log(`采集失败 ${url}: ${e.message}`);
      results.push({ url, title: "", content: "", error: e.message });
    }
  }

  GM_log(`\n=== 采集汇总 ===`);
  GM_log(`成功: ${results.filter((r) => !r.error).length} / ${results.length}`);
  return results;
}

// 示例 4: 点击 + 导航跟踪
async function clickAndTrack() {
  // 读取当前页面的链接
  const page = await CAT.agent.dom.readPage({ mode: "summary" });

  if (page.links.length === 0) {
    GM_log("页面上没有链接");
    return;
  }

  // 点击第一个链接
  const firstLink = page.links[0];
  GM_log(`点击链接: ${firstLink.text} → ${firstLink.href}`);

  const result = await CAT.agent.dom.click(firstLink.selector);

  if (result.navigated) {
    GM_log(`页面已跳转到: ${result.url}`);
  }
  if (result.newTab) {
    GM_log(`新标签页打开: #${result.newTab.tabId} ${result.newTab.url}`);
  }
  if (result.dialog) {
    GM_log(`弹窗: [${result.dialog.type}] ${result.dialog.message}`);
  }
}

// 运行示例
(async () => {
  // await searchAndCollect("ScriptCat 用户脚本管理器");
  // await scrollAndCollect(tabId);
  // await multiPageCollect(["https://example.com", "https://example.org"]);
  await clickAndTrack();
})();
