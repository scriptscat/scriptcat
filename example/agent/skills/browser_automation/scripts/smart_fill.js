// ==CATTool==
// @name         smart_fill
// @description  智能填充表单字段：直接使用 trusted 模式填充，填充后验证值是否正确
// @param        selector string [required] 目标表单元素的 CSS 选择器
// @param        value string [required] 要填充的值
// @param        tabId number [required] 目标标签页 ID
// @param        checkDelay number 填充后等待验证的时间（毫秒），默认 500
// @grant        CAT.agent.dom
// ==/CATTool==

const checkDelay = args.checkDelay || 500;
const escapedSelector = args.selector.replace(/'/g, "\\'");

try {
  // 检查元素是否存在
  const beforeValue = await CAT.agent.dom.executeScript(
    `const el = document.querySelector('${escapedSelector}');
     if (!el) return { exists: false };
     return { exists: true, value: el.value ?? el.textContent ?? '', tagName: el.tagName, type: el.type || '' };`,
    { tabId: args.tabId }
  );

  if (!beforeValue || !beforeValue.exists) {
    return { success: false, error: `元素未找到: ${args.selector}` };
  }

  // 直接使用 trusted 模式填充
  await CAT.agent.dom.fill(args.selector, args.value, {
    tabId: args.tabId,
    trusted: true,
  });

  // 等待后验证
  await new Promise((resolve) => setTimeout(resolve, checkDelay));

  const currentValue = await CAT.agent.dom.executeScript(
    `const el = document.querySelector('${escapedSelector}');
     return el ? (el.value ?? el.textContent ?? '') : null;`,
    { tabId: args.tabId }
  );

  if (currentValue === args.value) {
    return { success: true, value: args.value };
  }

  // 验证失败，返回详细信息
  return {
    success: false,
    error: "填充后验证失败：值不匹配",
    expectedValue: args.value,
    actualValue: currentValue,
    element: { tagName: beforeValue.tagName, type: beforeValue.type },
  };
} catch (e) {
  return { success: false, error: `填充失败: ${e.message || e}` };
}
