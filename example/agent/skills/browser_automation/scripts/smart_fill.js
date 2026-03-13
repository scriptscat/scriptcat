// ==CATTool==
// @name         smart_fill
// @description  Fill a form field using CDP trusted input and verify the value afterwards. Use this instead of execute_script for form filling — it triggers proper input/change events that frameworks (React, Vue) can detect.
// @param        selector string [required] CSS selector of the form element
// @param        value string [required] The value to fill in
// @param        tabId number [required] Target tab ID
// @param        checkDelay number Delay before verification in ms (default: 500)
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
