// ==CATTool==
// @name         dom_wait_for
// @description  等待指定 CSS 选择器的元素出现在页面中，返回元素基本信息
// @param        selector string [required] 要等待的元素的 CSS 选择器
// @param        tabId number 目标标签页 ID，不传则使用当前活动标签页
// @param        timeout number 超时时间（毫秒），默认 10000
// @grant        CAT.agent.dom
// ==/CATTool==

try {
  const selector = args.selector;
  if (!selector || typeof selector !== "string") {
    return { found: false, error: "缺少必要参数: selector" };
  }

  const options = {};
  if (args.tabId != null) options.tabId = args.tabId;
  if (args.timeout != null) options.timeout = args.timeout;

  const result = await CAT.agent.dom.waitFor(selector, options);

  if (result && result.found) {
    return {
      found: true,
      tagName: result.tagName,
      text: result.text,
      id: result.id,
      className: result.className,
    };
  }
  return { found: false, error: `元素未在超时时间内出现: ${selector}` };
} catch (e) {
  const msg = e.message || String(e);
  if (/timeout/i.test(msg)) {
    return { found: false, error: `等待超时（${args.timeout || 10000}ms）: ${selector}` };
  }
  return { found: false, error: `等待失败: ${msg}` };
}
