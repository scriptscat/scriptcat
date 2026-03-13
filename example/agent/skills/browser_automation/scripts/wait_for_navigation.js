// ==CATTool==
// @name         click_and_wait
// @description  点击元素并等待页面变化。通过 CDP 监控 JS 弹框和 DOM 变化，先用普通模式点击，无变化自动用 trusted 重试。有新增 DOM 元素时启动子 agent 分析返回摘要。
// @param        selector string [required] 要点击元素的 CSS 选择器
// @param        tabId number [required] 目标标签页 ID
// @param        timeout number 单次等待超时时间（毫秒），默认 5000
// @grant        CAT.agent.dom
// @grant        CAT.agent.conversation
// ==/CATTool==

const timeout = args.timeout || 5000;
const interval = 500;

// 快照当前标签页状态
const initialTabs = await CAT.agent.dom.listTabs();
const initialTabIds = new Set(initialTabs.map((t) => t.tabId));
const targetTab = initialTabs.find((t) => t.tabId === args.tabId);
const originalUrl = targetTab ? targetTab.url : "";

// 启动 CDP 监控（dialog 自动处理 + MutationObserver）
await CAT.agent.dom.startMonitor(args.tabId);

// 检测导航或新标签页
async function detectChanges() {
  const currentTabs = await CAT.agent.dom.listTabs();
  const tab = currentTabs.find((t) => t.tabId === args.tabId);
  const currentUrl = tab ? tab.url : "";
  const navigated = currentUrl !== originalUrl;
  const newTabs = currentTabs
    .filter((t) => !initialTabIds.has(t.tabId))
    .map((t) => ({ tabId: t.tabId, url: t.url, title: t.title }));
  return { navigated, currentUrl, newTabs };
}

// 点击并等待变化
async function clickAndPoll(trusted) {
  const clickResult = await CAT.agent.dom.click(args.selector, {
    tabId: args.tabId,
    trusted,
  });

  // click 本身已检测到导航或新标签
  if (clickResult.navigated || clickResult.newTab) {
    return {
      clicked: true,
      navigated: clickResult.navigated || false,
      url: clickResult.url || originalUrl,
      newTabs: clickResult.newTab ? [clickResult.newTab] : [],
    };
  }

  // 轮询等待
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const { navigated, currentUrl, newTabs } = await detectChanges();
    if (navigated || newTabs.length > 0) {
      return { clicked: true, navigated, url: currentUrl, newTabs };
    }
  }

  return null;
}

// 用子 agent 分析新增 DOM 变化
async function analyzeChanges(monitorResult) {
  const { dialogs, addedNodes } = monitorResult;
  const parts = [];

  if (dialogs && dialogs.length > 0) {
    parts.push(
      "JS 弹框:\n" + dialogs.map((d) => `- ${d.type}: ${d.message}`).join("\n")
    );
  }

  if (addedNodes && addedNodes.length > 0) {
    // 去重并限制数量
    const seen = new Set();
    const unique = addedNodes
      .filter((n) => {
        if (seen.has(n.text)) return false;
        seen.add(n.text);
        return true;
      })
      .slice(0, 10);
    parts.push(
      "新增 DOM 元素:\n" +
        unique
          .map((n) => {
            const attrs = [n.tag];
            if (n.id) attrs.push(`id="${n.id}"`);
            if (n.class) attrs.push(`class="${n.class}"`);
            if (n.role) attrs.push(`role="${n.role}"`);
            return `- <${attrs.join(" ")}> ${n.text}`;
          })
          .join("\n")
    );
  }

  if (parts.length === 0) return null;

  const conv = await CAT.agent.conversation.create({
    ephemeral: true,
    system: `你是一个页面变化分析专家。点击操作后页面出现了新的元素或弹框，请分析这些变化并用一句话总结：
- 这是什么类型的变化？（成功提示、错误提示、确认弹框、模态框、下拉菜单、加载状态等）
- 操作是否成功？
- 是否需要进一步操作？（如关闭弹框、确认、选择选项等）如果需要，给出元素的选择器。
直接回复分析结果，不要调用任何工具。`,
    maxIterations: 1,
    tools: [],
  });

  const reply = await conv.chat(parts.join("\n\n"));
  return reply.content;
}

// 停止监控并收集 + 分析结果
async function finalizeResult(base) {
  const monitorResult = await CAT.agent.dom.stopMonitor(args.tabId);
  if (monitorResult.dialogs && monitorResult.dialogs.length > 0) {
    base.dialogs = monitorResult.dialogs;
  }
  const analysis = await analyzeChanges(monitorResult);
  if (analysis) base.pageChanges = analysis;
  return base;
}

// 第一次：普通模式
const normalResult = await clickAndPoll(false);
if (normalResult) {
  normalResult.mode = "normal";
  return await finalizeResult(normalResult);
}

// 第二次：trusted 模式重试
const trustedResult = await clickAndPoll(true);
if (trustedResult) {
  trustedResult.mode = "trusted";
  return await finalizeResult(trustedResult);
}

// 两次都超时 — 检查是否有非导航类变化
const { currentUrl, newTabs } = await detectChanges();
return await finalizeResult({
  clicked: true,
  navigated: false,
  url: currentUrl,
  newTabs,
  timedOut: true,
});
