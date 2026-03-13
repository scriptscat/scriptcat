// ==UserScript==
// @name         DOM API - 表单自动填写
// @namespace    https://scriptcat.org/
// @version      0.1.0
// @description  示例：使用 CAT.agent.dom 自动填写表单，包括搜索框、登录框等场景
// @author       ScriptCat
// @match        *://*/*
// @grant        CAT.agent.dom
// @grant        GM_log
// @grant        GM_registerMenuCommand
// ==/UserScript==

// 示例 1: 自动填写搜索框并提交
async function autoSearch(keyword) {
  GM_log(`准备搜索: ${keyword}`);

  // 先读取页面，找到搜索框
  const page = await CAT.agent.dom.readPage({ mode: "summary" });

  // 查找搜索输入框
  const searchInput = page.interactable.find(
    (el) => el.tag === "input" && (el.type === "search" || el.type === "text")
  );
  if (!searchInput) {
    GM_log("未找到搜索框");
    return;
  }

  // 填写搜索关键词
  await CAT.agent.dom.fill(searchInput.selector, keyword);
  GM_log("已填写搜索关键词");

  // 查找搜索按钮
  const searchBtn = page.interactable.find(
    (el) => (el.tag === "button" || el.role === "button") && /搜索|search|go/i.test(el.text)
  );
  if (searchBtn) {
    const result = await CAT.agent.dom.click(searchBtn.selector);
    GM_log(`点击搜索按钮，页面跳转: ${result.navigated}, URL: ${result.url}`);
  }
}

// 示例 2: 自动填写表单的所有字段
async function fillForm(formData) {
  const page = await CAT.agent.dom.readPage({ mode: "summary" });

  if (page.forms.length === 0) {
    GM_log("页面上没有找到表单");
    return;
  }

  const form = page.forms[0];
  GM_log(`找到表单: ${form.selector}, ${form.fields.length} 个字段`);

  // 逐一填写表单字段
  for (const field of form.fields) {
    const value = formData[field.name];
    if (value) {
      await CAT.agent.dom.fill(field.selector, value);
      GM_log(`已填写 ${field.name} = ${value}`);
    }
  }

  GM_log("表单填写完毕");
}

// 示例 3: 等待元素出现后再操作
async function waitAndFill() {
  // 等待动态加载的表单出现
  const result = await CAT.agent.dom.waitFor("form.dynamic-form", {
    timeout: 5000,
  });

  if (!result.found) {
    GM_log("等待超时，表单未出现");
    return;
  }

  GM_log(`表单已出现: ${result.element.selector}`);

  // 填写表单
  await CAT.agent.dom.fill("form.dynamic-form input[name='email']", "user@example.com");
  await CAT.agent.dom.fill("form.dynamic-form input[name='name']", "Test User");
  GM_log("动态表单填写完毕");
}

GM_registerMenuCommand("搜索示例", () => autoSearch("ScriptCat 油猴脚本"));
GM_registerMenuCommand("填写表单", () =>
  fillForm({
    username: "testuser",
    email: "test@example.com",
    password: "SecurePass123",
  })
);
GM_registerMenuCommand("等待并填写", waitAndFill);
