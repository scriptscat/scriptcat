// ==CATTool==
// @name         dom_scroll
// @description  滚动页面（上/下/顶部/底部），返回滚动位置信息便于判断是否到底
// @param        direction string [required] 滚动方向: up, down, top, bottom
// @param        tabId number 目标标签页 ID，不传则使用当前活动标签页
// @param        selector string 滚动指定容器元素的 CSS 选择器（不传则滚动整个页面）
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
