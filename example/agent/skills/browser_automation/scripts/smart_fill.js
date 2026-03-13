// ==CATTool==
// @name         smart_fill
// @description  智能填充表单字段：先用普通模式填充并验证，失败则自动用 trusted 模式重试，仍失败则返回错误信息
// @param        selector string [required] 目标表单元素的 CSS 选择器
// @param        value string [required] 要填充的值
// @param        tabId number [required] 目标标签页 ID
// @param        checkDelay number 填充后等待验证的时间（毫秒），默认 500
// @grant        CAT.agent.dom
// ==/CATTool==

const checkDelay = args.checkDelay || 500;

// 读取填充前的值
const beforeValue = await CAT.agent.dom.executeScript(
  `const el = document.querySelector('${args.selector.replace(/'/g, "\\'")}');
   return el ? (el.value ?? el.textContent ?? '') : null;`,
  { tabId: args.tabId }
);

if (beforeValue === null) {
  return { success: false, error: `元素未找到: ${args.selector}` };
}

// 验证填充结果的辅助函数
async function checkFilled() {
  await new Promise((resolve) => setTimeout(resolve, checkDelay));
  const currentValue = await CAT.agent.dom.executeScript(
    `const el = document.querySelector('${args.selector.replace(/'/g, "\\'")}');
     return el ? (el.value ?? el.textContent ?? '') : null;`,
    { tabId: args.tabId }
  );
  return currentValue === args.value;
}

// 第一次：普通模式填充
await CAT.agent.dom.fill(args.selector, args.value, {
  tabId: args.tabId,
  trusted: false,
});

if (await checkFilled()) {
  return { success: true, mode: "normal", value: args.value };
}

// 第二次：trusted 模式重试
await CAT.agent.dom.fill(args.selector, args.value, {
  tabId: args.tabId,
  trusted: true,
});

if (await checkFilled()) {
  return { success: true, mode: "trusted", value: args.value };
}

// 两次都失败
const finalValue = await CAT.agent.dom.executeScript(
  `const el = document.querySelector('${args.selector.replace(/'/g, "\\'")}');
   return el ? (el.value ?? el.textContent ?? '') : null;`,
  { tabId: args.tabId }
);

return {
  success: false,
  error: "填充失败：普通模式和 trusted 模式均未成功",
  expectedValue: args.value,
  actualValue: finalValue,
};
