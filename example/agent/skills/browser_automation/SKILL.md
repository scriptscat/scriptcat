---
name: browser-automation
description: 通用浏览器自动化 — 子 agent 分析页面返回操作建议，主 agent 执行 DOM 操作
---

# Browser Automation Skill

你可以使用 `browser_action` 工具来分析页面内容。该工具会启动一个子 agent 读取页面 DOM，返回精简的分析结果（选择器、提取的数据、操作建议等）。页面原始内容留在子 agent 中，不会进入你的上下文。

## 工作流程

对于浏览器自动化任务，按照「分析 → 操作 → 分析 → 操作」的循环执行：

1. 用 `dom_list_tabs` 确定目标 tabId
2. 调用 `browser_action` 分析页面，获取选择器和操作建议
3. 根据返回的选择器执行操作：
   - **填写表单优先使用 `smart_fill`**，它会自动验证填充结果，失败时用 trusted 模式重试
   - **点击操作优先使用 `click_and_wait`**，它将点击和导航检测合为原子操作，能捕获异步跳转和新标签页
   - 仅在明确不需要等待导航时（如展开下拉菜单、切换 tab）才用 `dom_click`
   - 仅在明确不需要验证填充结果时才用 `dom_fill`
4. 再次调用 `browser_action` 检查操作结果或分析下一步
5. 重复直到任务完成

## trusted 模式策略

`click_and_wait` 和 `smart_fill` **已内置 trusted 自动重试**：先用普通模式操作，无效果时自动用 trusted（CDP `isTrusted=true`）重试，无需手动传参。

对于直接使用 `dom_click` / `dom_fill` 的场景，仍需手动处理：
- 首次不传 `trusted`（避免触发浏览器调试提示条）
- 操作没有生效时，再用 `trusted: true` 重试

## 使用示例

**搜索任务**:
```
→ browser_action("找到搜索框和搜索按钮的选择器", tabId=123)
← "搜索框: #kw，搜索按钮: #su"
→ smart_fill("#kw", "ScriptCat", tabId=123)
← { success: true, mode: "normal", value: "ScriptCat" }
→ click_and_wait("#su", tabId=123)
← { clicked: true, navigated: true, url: "https://baidu.com/s?wd=ScriptCat", mode: "normal" }
→ browser_action("提取搜索结果前5条的标题和链接", tabId=123)
← "1. ScriptCat 官网 - https://..."
```

**自动 trusted 重试**（无需手动处理）:
```
→ click_and_wait("#login-btn", tabId=123)
← { clicked: true, navigated: true, url: "https://...", mode: "trusted" }
  （内部：普通点击无响应 → 自动 trusted 重试 → 成功）
```

**自动分析页面变化**（捕获新增 DOM 元素，子 agent 分析后返回摘要）:
```
→ click_and_wait(".add-cart-btn", tabId=123)
← { clicked: true, navigated: false, timedOut: true,
     pageChanges: "成功提示：已加入购物车，无需进一步操作" }

→ click_and_wait(".delete-btn", tabId=123)
← { clicked: true, navigated: false, timedOut: true,
     pageChanges: "确认弹框：'确定要删除吗？'，需要点击确认按钮 `.modal .btn-ok`" }
```

**数据提取**:
```
→ browser_action("提取页面上商品列表的名称和价格", tabId=123)
← "1. 商品A ¥99  2. 商品B ¥199 ..."
```

**表单填写**:
```
→ browser_action("分析页面上的表单结构，列出所有字段的选择器", tabId=123)
← "用户名: #username, 邮箱: #email, 密码: #password, 提交: button[type=submit]"
→ smart_fill("#username", "test", tabId=123)
← { success: true, mode: "normal", value: "test" }
→ smart_fill("#email", "test@example.com", tabId=123)
← { success: true, mode: "trusted", value: "test@example.com" }
→ smart_fill("#password", "123456", tabId=123)
← { success: true, mode: "normal", value: "123456" }
→ click_and_wait("button[type=submit]", tabId=123)
← { clicked: true, navigated: true, url: "https://dashboard..." }
```

**新标签页**:
```
→ click_and_wait("a.detail-link", tabId=123, timeout=5000)
← { clicked: true, navigated: false, newTabs: [{ tabId: 456, url: "https://..." }] }
→ browser_action("读取新页面内容", tabId=456)
```

## scenario 描述技巧

`browser_action` 的 scenario 参数要**具体明确**，避免笼统的描述：

- 好："找到搜索框和搜索按钮的选择器" — 目标明确
- 好："提取搜索结果前 5 条的标题和链接" — 清楚要什么数据
- 好："判断当前是否需要登录，如果已登录找搜索框选择器" — 包含条件判断
- 不好："分析这个页面" — 太笼统，子 agent 不知道要分析什么

如果前一步操作后需要确认状态，scenario 要说明期望：
- "确认搜索结果是否加载完成，提取前 3 条结果"
- "检查表单是否提交成功，页面是否跳转到了新页面"

## 注意事项

- **弹窗拦截**：部分操作可能触发新窗口/标签页（如 `window.open`、`target="_blank"` 链接），浏览器默认会拦截弹窗。如果点击后没有预期的新标签页出现，提示用户前往目标站点的地址栏左侧 → 网站设置 → 将「弹出式窗口和重定向」改为「允许」，然后重试
- `browser_action` 只做页面分析，不执行点击/填写等操作，操作由你直接调用 DOM 工具完成
- 每次调用 `browser_action` 是无状态的，不保留之前的页面分析结果
- 当点击可能触发导航或打开新窗口时，使用 `click_and_wait` 而不是 `dom_click`
- `click_and_wait` 会自动检测点击后的页面变化（新增 DOM 元素、JS 弹框），通过子 agent 分析后返回 `pageChanges` 摘要，无需再调用 `browser_action` 确认操作结果
- 操作后页面可能发生变化（如导航、动态加载），需再次调用 `browser_action` 重新分析
- 如果 `browser_action` 返回"找不到某元素"，注意它可能给出了建议（如需要先点击某个入口展开面板），按建议操作后再次分析
