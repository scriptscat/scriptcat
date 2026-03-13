# CAT.agent.dom 示例

通过 `@grant CAT.agent.dom` 在用户脚本中操作浏览器标签页和页面 DOM。

## 前置要求

1. 安装 ScriptCat 浏览器扩展
2. 脚本中声明 `@grant CAT.agent.dom`
3. 首次使用会弹出权限确认对话框

## 示例说明

| 文件                 | 说明                                           | 关键 API                                            |
| -------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `page_reader.js`     | 读取页面内容，支持 summary/detail 模式和选择器 | `readPage()`                                        |
| `form_filler.js`     | 自动填写表单，等待动态元素                     | `fill()`, `click()`, `waitFor()`                    |
| `tab_manager.js`     | 标签页管理、导航、截图                         | `listTabs()`, `navigate()`, `screenshot()`          |
| `web_automation.js`  | 完整自动化流程：搜索、滚动采集、多页面操作     | 组合使用所有 API                                    |

## 快速开始

```javascript
// ==UserScript==
// @grant CAT.agent.dom
// ==/UserScript==

// 读取当前页面结构
const page = await CAT.agent.dom.readPage({ mode: "summary" });
console.log(page.title, page.links.length + " 个链接");

// 点击某个按钮
await CAT.agent.dom.click("#submit-btn");
```

## API 概览

### 标签页管理

- **`CAT.agent.dom.listTabs()`** — 列出所有标签页，返回 `TabInfo[]`
- **`CAT.agent.dom.navigate(url, options?)`** — 打开/导航到 URL
  - `tabId`: 指定标签页（不传则新建）
  - `waitUntil`: 是否等待页面加载完成（默认 true）
  - `timeout`: 超时毫秒数（默认 30000）

### 页面内容

- **`CAT.agent.dom.readPage(options?)`** — 读取页面内容
  - `mode`: `"summary"`（骨架结构）或 `"detail"`（完整文本）
  - `selector`: CSS 选择器，只读取匹配区域
  - `maxLength`: 最大内容长度（默认 4000）
  - `viewportOnly`: 仅读取可视区域
  - `tabId`: 指定标签页
- **`CAT.agent.dom.screenshot(options?)`** — 截图，返回 base64 data URL
  - `quality`: 图片质量 0-100（默认 80）
  - `tabId`: 指定标签页

### DOM 操作

- **`CAT.agent.dom.click(selector, options?)`** — 点击元素
  - `trusted`: 使用 CDP 模拟真实点击（需要 debugger 权限）
  - 返回 `ActionResult`：包含导航/新标签页/弹窗信息
- **`CAT.agent.dom.fill(selector, value, options?)`** — 填写表单字段
  - `trusted`: 使用 CDP 逐字符输入
- **`CAT.agent.dom.scroll(direction, options?)`** — 滚动页面
  - `direction`: `"up"` / `"down"` / `"top"` / `"bottom"`
  - `selector`: 滚动指定容器（不传则滚动整个页面）
- **`CAT.agent.dom.waitFor(selector, options?)`** — 等待元素出现
  - `timeout`: 超时毫秒数（默认 10000）

### 返回值类型

#### PageContent（readPage 返回）

```typescript
{
  title: string;           // 页面标题
  url: string;             // 页面 URL
  content?: string;        // 文本内容（detail 模式）
  sections?: SectionInfo[];// 页面分区（summary 模式）
  interactable: [];        // 可交互元素（按钮、输入框等）
  forms: [];               // 表单及其字段
  links: [];               // 链接列表
  truncated?: boolean;     // 是否被截断
}
```

#### ActionResult（click 返回）

```typescript
{
  success: boolean;
  navigated?: boolean;     // 是否触发了页面跳转
  url: string;             // 当前 URL
  newTab?: { tabId, url }; // 是否打开了新标签页
  dialog?: { type, message }; // 是否触发了弹窗
}
```

## Trusted 模式

传入 `{ trusted: true }` 可通过 Chrome DevTools Protocol（CDP）模拟真实的鼠标点击和键盘输入（`event.isTrusted === true`），用于绕过某些只响应真实用户事件的网页。首次使用需要授权 debugger 权限。

```javascript
// 真实点击
await CAT.agent.dom.click("#btn", { trusted: true });
// 真实键盘输入
await CAT.agent.dom.fill("#input", "hello", { trusted: true });
```
