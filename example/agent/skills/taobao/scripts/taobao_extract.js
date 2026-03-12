// ==CATTool==
// @name         taobao_extract
// @description  根据淘宝页面类型，使用定制选择器提取结构化数据。支持搜索结果、商品详情、评价等页面。
// @param        pageType string[search_results,product_detail,reviews,auto] 页面类型，auto 将自动判断
// @param        tabId number 目标标签页 ID，不传则使用当前活动标签页
// @param        maxItems number 最大提取条目数（搜索结果/评价），默认 10
// @grant        CAT.agent.dom
// ==/CATTool==

const maxItems = args.maxItems || 10;

// 读取页面信息用于判断类型和提取内容
// 先用 summary 模式获取页面基本信息
const summary = await CAT.agent.dom.readPage({
  tabId: args.tabId,
  mode: "summary",
  maxLength: 2000,
});

const url = summary.url || "";
let pageType = args.pageType || "auto";

// 自动检测页面类型
if (pageType === "auto") {
  if (url.includes("s.taobao.com/search") || url.includes("search.taobao.com")) {
    pageType = "search_results";
  } else if (
    url.includes("item.taobao.com") ||
    url.includes("detail.tmall.com") ||
    url.includes("chaoshi.detail.tmall.com")
  ) {
    pageType = "product_detail";
  } else if (url.includes("rate") || url.includes("comment")) {
    pageType = "reviews";
  } else {
    pageType = "search_results"; // 默认当搜索结果处理
  }
}

// 根据页面类型使用不同的提取策略
// 通过 dom_read_page 的 selector 参数定向读取
if (pageType === "search_results") {
  // 搜索结果页 — 提取商品列表
  // 淘宝搜索结果的商品卡片常见选择器
  const selectors = [
    '[class*="Card--doubleCard"]',
    '[class*="items"] [class*="item"]',
    ".m-itemlist .items .item",
    '[class*="search-content"] [class*="Card"]',
    '[class*="Content--content"] [class*="Card"]',
    '[data-spm*="list"] [class*="card"]',
  ];

  // 尝试每个选择器找到商品列表
  let content = null;
  let usedSelector = "";
  for (const sel of selectors) {
    try {
      content = await CAT.agent.dom.readPage({
        tabId: args.tabId,
        selector: sel,
        mode: "detail",
        maxLength: 1500,
      });
      if (content.content && content.content.length > 20) {
        usedSelector = sel;
        break;
      }
    } catch {
      continue;
    }
  }

  // 如果定制选择器都不生效，用 viewportOnly 降低噪声
  if (!content || !content.content || content.content.length <= 20) {
    content = await CAT.agent.dom.readPage({
      tabId: args.tabId,
      mode: "detail",
      maxLength: 4000,
      viewportOnly: true,
    });
    usedSelector = "viewportOnly fallback";
  }

  return {
    pageType: "search_results",
    title: summary.title,
    url,
    usedSelector,
    content: content.content || "(无法提取内容，页面可能尚未加载完成)",
    tip: "如果内容为空，请尝试：1) dom_wait_for 等待加载 2) dom_scroll 触发懒加载 3) 确认页面已登录",
  };
}

if (pageType === "product_detail") {
  // 商品详情页 — 分区域提取
  const result = {
    pageType: "product_detail",
    title: summary.title,
    url,
    sections: {},
  };

  // 标题和价格区域
  const priceSelectors = [
    '[class*="Price"]',
    '[class*="price"]',
    "#J_StrPrice",
    ".tb-rmb-num",
    '[class*="ItemHeader"]',
  ];
  for (const sel of priceSelectors) {
    try {
      const data = await CAT.agent.dom.readPage({
        tabId: args.tabId,
        selector: sel,
        mode: "detail",
        maxLength: 500,
      });
      if (data.content && data.content.length > 5) {
        result.sections.price = data.content.trim();
        break;
      }
    } catch {
      continue;
    }
  }

  // 商品信息/参数
  const infoSelectors = [
    '[class*="Attrs"]',
    '[class*="attributes"]',
    ".attributes-list",
    "#J_AttrUL",
    '[class*="InfoCard"]',
  ];
  for (const sel of infoSelectors) {
    try {
      const data = await CAT.agent.dom.readPage({
        tabId: args.tabId,
        selector: sel,
        mode: "detail",
        maxLength: 1500,
      });
      if (data.content && data.content.length > 10) {
        result.sections.attributes = data.content.trim();
        break;
      }
    } catch {
      continue;
    }
  }

  // SKU 选择区域
  const skuSelectors = ['[class*="Sku"]', '[class*="sku"]', "#J_isku", '[class*="SKU"]'];
  for (const sel of skuSelectors) {
    try {
      const data = await CAT.agent.dom.readPage({
        tabId: args.tabId,
        selector: sel,
        mode: "detail",
        maxLength: 1000,
      });
      if (data.content && data.content.length > 10) {
        result.sections.sku = data.content.trim();
        break;
      }
    } catch {
      continue;
    }
  }

  // 评价摘要
  const reviewSelectors = [
    '[class*="Review"]',
    '[class*="review"]',
    '[class*="rate"]',
    "#J_Rate",
    '[class*="Comment"]',
  ];
  for (const sel of reviewSelectors) {
    try {
      const data = await CAT.agent.dom.readPage({
        tabId: args.tabId,
        selector: sel,
        mode: "detail",
        maxLength: 1500,
      });
      if (data.content && data.content.length > 10) {
        result.sections.reviews = data.content.trim();
        break;
      }
    } catch {
      continue;
    }
  }

  // 如果所有分区都没拿到，fallback 到 viewportOnly
  if (Object.keys(result.sections).length === 0) {
    const fallback = await CAT.agent.dom.readPage({
      tabId: args.tabId,
      mode: "detail",
      maxLength: 4000,
      viewportOnly: true,
    });
    result.sections.viewport = fallback.content || "(无法提取)";
    result.tip = "分区选择器未匹配，已回退到可见区域提取。淘宝页面结构可能有更新。";
  }

  return result;
}

if (pageType === "reviews") {
  // 评价页 — 提取评价列表
  const reviewSelectors = [
    '[class*="Review"]',
    '[class*="review"]',
    '[class*="rate-list"]',
    '[class*="Comment"]',
    '[class*="comment-list"]',
  ];

  let content = null;
  for (const sel of reviewSelectors) {
    try {
      content = await CAT.agent.dom.readPage({
        tabId: args.tabId,
        selector: sel,
        mode: "detail",
        maxLength: 4000,
      });
      if (content.content && content.content.length > 20) break;
    } catch {
      continue;
    }
  }

  if (!content || !content.content) {
    content = await CAT.agent.dom.readPage({
      tabId: args.tabId,
      mode: "detail",
      maxLength: 4000,
      viewportOnly: true,
    });
  }

  return {
    pageType: "reviews",
    title: summary.title,
    url,
    content: content.content || "(无法提取评价内容)",
  };
}

return { error: `未知页面类型: ${pageType}` };
