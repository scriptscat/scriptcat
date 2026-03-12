// ==CATTool==
// @name         text_processor
// @description  文本处理工具，支持字数统计、提取关键词、文本摘要等操作
// @param        text string [required] 要处理的文本内容
// @param        action string[count,keywords,reverse] 处理动作
// @param        maxLength number 最大输出长度限制
// ==/CATTool==

const text = args.text;
const action = args.action || "count";
const maxLength = args.maxLength || 500;

switch (action) {
  case "count": {
    // 字数统计
    const chars = text.length;
    const words = text.split(/\s+/).filter(Boolean).length;
    const lines = text.split("\n").length;
    return { chars, words, lines };
  }
  case "keywords": {
    // 简单关键词提取：按词频排序
    const words = text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 1);
    const freq = {};
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }
    const sorted = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    return { keywords: sorted.map(([word, count]) => ({ word, count })) };
  }
  case "reverse": {
    // 文本反转
    const result = text.split("").reverse().join("");
    return { result: result.slice(0, maxLength) };
  }
  default:
    return { error: `未知的操作: ${action}，支持: count, keywords, reverse` };
}
