// ==CATTool==
// @name         browser_action
// @description  分析页面内容并返回精简结果（选择器、提取的数据、操作建议），不执行点击/填写等操作
// @param        scenario string [required] 分析任务描述，如"找到搜索框和搜索按钮的选择器"或"提取搜索结果前5条"
// @param        tabId number 目标标签页 ID，不传则使用当前活动标签页
// @grant        CAT.agent.conversation
// @grant        CAT.agent.dom
// ==/CATTool==

const SYSTEM_PROMPT = `你是一个页面分析专家。你的任务是读取和分析页面内容，返回精简的结果给调用者。

## 你的职责

你只负责**分析页面**，不执行点击、填写等操作。具体包括：
- 定位元素并返回可用的 CSS 选择器
- 提取页面上的数据（文本、链接、列表等）
- 分析页面结构和表单字段
- 检查页面状态（是否登录、是否有弹窗等）

## 可用工具

- **read_page**: 读取页面骨架（精简 HTML：只保留定位属性和文本摘要，移除 src/href/style 等）
  - selector: CSS 选择器缩小范围（推荐使用）
  - maxLength: 最大返回长度
- **execute_script**: 在页面中执行 JS 代码，适合精准提取信息
  - code: JavaScript 代码
  - **重要**: 代码通过 \`new Function(code)\` 执行，必须用 \`return\` 返回值。
  - 正确: \`return document.title\`
  - 正确: \`const el = document.querySelector('#id'); return el ? el.textContent : null\`
  - 错误: \`(() => { return document.title })()\` — IIFE 的 return 不是外层函数的 return，结果为 null

## 分析流程

初始消息中已包含页面骨架 HTML，你**不需要调用 read_page** 就已经了解页面结构。

1. **直接分析骨架**：根据已有的骨架 HTML 判断页面结构、定位元素
2. **如需精确数据**：用 **execute_script** 一次性提取所有需要的信息（合并到一个脚本）
3. **如果返回 null**：简化代码重试一次（大概率是语法错误）
4. **如需局部细节**：仅在骨架被截断或需要特定区域更多细节时，才用 **read_page** 传 selector 缩小范围读取

**最多调用 3 次工具，然后立即回复结果**。即使信息不完整，也要基于已有结果回复，说明哪些信息未能获取。如果骨架已经足够回答问题，**直接回复，不要调用任何工具**。

## execute_script 编写规范

**一次提取所有需要的信息**，返回一个结果对象：

\`\`\`js
// 好：一次性提取商品页多个信息
const title = document.querySelector('h1')?.textContent?.trim();
const price = document.querySelector('.price')?.textContent?.trim();
const btn = document.querySelector('.add-cart, [class*="cart"]');
return {
  title,
  price,
  cartBtn: btn ? { id: btn.id, class: btn.className, tag: btn.tagName } : null
};
\`\`\`

- 将所有需要查询的信息合并到一个脚本，返回一个对象
- 不要写 cssPath 等辅助函数，直接返回元素的 id、className、文本等属性
- 如果返回 null 且不符合预期，简化代码重试（大概率是语法错误）
- 使用 \`?.\` 可选链避免空指针，缺失的字段返回 null 即可

## 选择器构造

从 execute_script 返回的元素属性中，按以下优先级构造选择器：
1. \`#elementId\` — 有 id 直接用
2. \`[name="fieldName"]\` — 表单元素优先用 name
3. \`[data-xxx="value"]\` — data 属性通常稳定
4. \`[aria-label="text"]\` — 无障碍属性
5. \`.className1.className2\` — 注意排除动态生成的 hash class（如 \`PurchasePanel--JEB_OhIE\`）
6. 文本匹配描述 — 如果以上都不可用，描述元素特征让调用者决定

**重要**：read_page 返回的是精简骨架，无属性的包装层（div/span 等）会被折叠。因此：
- 不要根据 read_page 的 HTML 层级关系构造 \`>\` 直接子选择器（如 \`.parent > button\`）
- 优先使用不依赖层级的选择器（id、name、class、属性）
- 如果必须用层级关系，用后代选择器 \`.parent button\` 而不是 \`.parent > button\`

## 回复格式

针对不同任务返回不同格式：

**定位元素时**：返回选择器 + 元素描述
> 搜索框: \`#kw\`（input，placeholder="搜索"）
> 搜索按钮: \`#su\`（button，文本"百度一下"）

**提取数据时**：返回结构化数据
> 1. ScriptCat 官网 - https://scriptcat.org/
> 2. GitHub - https://github.com/nicecai/scriptcat

**分析状态时**：返回判断结论 + 依据
> 当前已登录，用户昵称"幻想太美好8"（位于 \`.site-nav-login-info-nick\`）

**找不到元素时**：说明原因 + 建议
> 未找到"加入购物车"按钮，可能原因：该按钮在 SKU 选择面板中，需要先点击"购买规格"（\`.specTrigger\`）展开面板后才会出现。`;

// 确定 tabId
let targetTabId = args.tabId;
if (!targetTabId) {
  const tabs = await CAT.agent.dom.listTabs();
  const activeTab = tabs.find((t) => t.active);
  if (activeTab) {
    targetTabId = activeTab.tabId;
  } else if (tabs.length > 0) {
    targetTabId = tabs[0].tabId;
  } else {
    return "错误：没有找到任何打开的标签页";
  }
}

// 读取页面骨架的脚本（复用于预读取和 read_page 工具）
function buildSkeletonScript(selector, maxLength) {
  return `
    var KEEP_ATTRS = ['id','class','name','type','placeholder','role','aria-label','value','for','action','method','data-testid'];
    var SKIP_TAGS = ['SCRIPT','STYLE','NOSCRIPT','SVG','LINK','META','BR','HR','IMG','VIDEO','AUDIO','CANVAS','IFRAME'];
    var WRAPPER_TAGS = ['DIV','SPAN','SECTION','ARTICLE','MAIN','HEADER','FOOTER','NAV','ASIDE','FIGURE','FIGCAPTION'];
    var TEXT_LIMIT = 100;
    var root = document.querySelector('${selector.replace(/'/g, "\\'")}');
    if (!root) return null;
    function hasAttrs(el) {
      for (var i = 0; i < KEEP_ATTRS.length; i++) {
        if (el.getAttribute(KEEP_ATTRS[i])) return true;
      }
      return false;
    }
    function walk(node, depth) {
      if (depth > 30) return '';
      if (node.nodeType === 3) {
        var t = node.textContent.trim();
        if (!t) return '';
        return t.length > TEXT_LIMIT ? t.slice(0, TEXT_LIMIT) + '...' : t;
      }
      if (node.nodeType !== 1) return '';
      var el = node;
      var tag = el.tagName;
      if (SKIP_TAGS.indexOf(tag) >= 0) return '';
      var style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return '';
      var children = '';
      for (var j = 0; j < el.childNodes.length; j++) {
        children += walk(el.childNodes[j], depth + 1);
      }
      if (!children.trim() && !hasAttrs(el)) return '';
      if (!hasAttrs(el) && WRAPPER_TAGS.indexOf(tag) >= 0) {
        var elementChildren = [];
        for (var k = 0; k < el.childNodes.length; k++) {
          var c = el.childNodes[k];
          if (c.nodeType === 1) elementChildren.push(c);
          else if (c.nodeType === 3 && c.textContent.trim()) elementChildren.push(c);
        }
        if (elementChildren.length <= 1) return children;
      }
      var attrs = '';
      for (var i = 0; i < KEEP_ATTRS.length; i++) {
        var val = el.getAttribute(KEEP_ATTRS[i]);
        if (val) attrs += ' ' + KEEP_ATTRS[i] + '="' + val.replace(/"/g, '&quot;') + '"';
      }
      var lower = tag.toLowerCase();
      return '<' + lower + attrs + '>' + children + '</' + lower + '>';
    }
    var html = walk(root, 0);
    var title = document.title;
    var url = location.href;
    return { title: title, url: url, html: html.slice(0, ${maxLength}), truncated: html.length > ${maxLength} };
  `;
}

async function readPageSkeleton(selector, maxLength) {
  const result = await CAT.agent.dom.executeScript(
    buildSkeletonScript(selector, maxLength),
    { tabId: targetTabId }
  );
  return result || { title: "", url: "", html: "元素未找到: " + selector };
}

// 预读取页面骨架，嵌入到初始消息中
const initialSkeleton = await readPageSkeleton("body", 200000);

// 创建无状态子 conversation，只提供分析类工具
const conv = await CAT.agent.conversation.create({
  ephemeral: true,
  system: SYSTEM_PROMPT,
  maxIterations: 5,
  tools: [
    {
      name: "read_page",
      description:
        "读取页面骨架 HTML（只保留元素定位属性和文本摘要）。用于缩小范围重新读取页面局部区域。初始消息中已包含 body 级别的完整骨架，通常不需要再次调用，除非需要读取特定区域的更多细节。",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "CSS 选择器，缩小读取范围",
          },
          maxLength: {
            type: "number",
            description: "最大返回内容长度（默认 200000）",
          },
        },
        required: ["selector"],
      },
      handler: async (handlerArgs) => {
        return await readPageSkeleton(
          handlerArgs.selector,
          handlerArgs.maxLength || 200000
        );
      },
    },
    {
      name: "execute_script",
      description:
        "在页面中执行 JavaScript 代码。代码通过 new Function(code) 执行，必须用 return 语句返回值（不要用 IIFE）。例如：return document.querySelector('#id').textContent",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "要执行的 JS 代码，必须用 return 返回值",
          },
        },
        required: ["code"],
      },
      handler: async (handlerArgs) => {
        return await CAT.agent.dom.executeScript(handlerArgs.code, {
          tabId: targetTabId,
        });
      },
    },
  ],
});

// 将页面骨架和任务描述一起发送，子 agent 无需再调用 read_page
const message = `## 任务
${args.scenario}

## 当前页面骨架
- 标题: ${initialSkeleton.title}
- URL: ${initialSkeleton.url}
${initialSkeleton.truncated ? "- （骨架已截断，可用 read_page 读取局部区域）" : ""}

\`\`\`html
${initialSkeleton.html}
\`\`\``;

const reply = await conv.chat(message);
return reply.content;
