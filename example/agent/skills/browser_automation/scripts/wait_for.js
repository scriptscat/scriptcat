// ==CATTool==
// @name         wait_for
// @description  Wait for an element matching the CSS selector to appear in the DOM. Returns element info (tagName, text, id, className) on success, or an error on timeout.
// @param        selector string [required] CSS selector of the element to wait for
// @param        tabId number Target tab ID (defaults to the active tab)
// @param        timeout number Timeout in milliseconds (default: 10000)
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
