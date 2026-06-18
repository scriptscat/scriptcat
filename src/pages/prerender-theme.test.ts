// can be tested with vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// 防止初始加载时的「白屏闪烁」回归（#1497 / PR #1498）：
// src/pages/common.ts 是一个独立预渲染脚本，在 React 挂载前同步给 <html> 加上 .dark，
// 使首帧就拿到正确的明暗背景。它必须被各主题化页面在 <head> 中尽早加载，否则脚本
// 虽被打包却无人引用（develop/new-ui 合并 PR #1498 时正是丢失了这处 HTML 接线）。
const repoRoot = process.cwd();
const pagesDir = path.join(repoRoot, "src/pages");

// 走主题（ThemeProvider + index.css 设计令牌）的可见页面，需要预渲染脚本。
const themedPages = ["options.html", "popup.html", "install.html", "import.html"];

describe("初始加载白屏闪烁修复（#1497）", () => {
  it("主题化页面应在 <head> 中加载 common.js 预渲染脚本", () => {
    for (const page of themedPages) {
      const html = fs.readFileSync(path.join(pagesDir, page), "utf8");
      const headContent = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
      expect(headContent, `${page} 缺少 common.js 预渲染脚本`).toMatch(/<script\s+src=["']common\.js["']\s*>/);
    }
  });
});
