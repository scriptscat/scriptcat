// ==CATTool==
// @name         scroll
// @description  Scroll the page or a specific container. Returns scroll position and whether top/bottom has been reached (atTop, atBottom).
// @param        direction string [required] Scroll direction: up, down, top, bottom
// @param        tabId number Target tab ID (defaults to the active tab)
// @param        selector string CSS selector of a scrollable container (defaults to the whole page)
// @grant        CAT.agent.dom
// ==/CATTool==

try {
  const direction = args.direction;
  if (!direction || !["up", "down", "top", "bottom"].includes(direction)) {
    return { success: false, error: `无效的滚动方向: ${direction}，可选值: up, down, top, bottom` };
  }

  const options = {};
  if (args.tabId != null) options.tabId = args.tabId;
  if (args.selector) options.selector = args.selector;

  const result = await CAT.agent.dom.scroll(direction, options);

  return {
    success: true,
    direction,
    scrollTop: result.scrollTop,
    scrollHeight: result.scrollHeight,
    clientHeight: result.clientHeight,
    atTop: result.scrollTop <= 0,
    atBottom: result.scrollTop + result.clientHeight >= result.scrollHeight - 5,
  };
} catch (e) {
  const msg = e.message || String(e);
  if (args.selector && /not found|no such/i.test(msg)) {
    return { success: false, error: `滚动失败：元素未找到 (${args.selector})` };
  }
  return { success: false, error: `滚动失败: ${msg}` };
}
