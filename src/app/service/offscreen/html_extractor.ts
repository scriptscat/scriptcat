import type { Group } from "@Packages/message/server";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export class HtmlExtractorService {
  constructor(private group: Group) {}

  init() {
    this.group.on("extractHtmlContent", (html: string) => this.extractHtmlContent(html));
    this.group.on("extractHtmlWithSelectors", (html: string) => this.extractHtmlWithSelectors(html));
    this.group.on("extractSearchResults", (html: string) => this.extractSearchResults(html));
  }

  extractHtmlContent(html: string): string | null {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // 移除不需要的元素
      const removeSelectors = ["script", "style", "nav", "header", "footer", "aside", "svg", "noscript", "iframe"];
      for (const selector of removeSelectors) {
        doc.querySelectorAll(selector).forEach((el) => el.remove());
      }

      // 优先取主内容区域
      const mainEl = doc.querySelector('main, article, [role="main"]') || doc.body;
      if (!mainEl) return null;

      const lines: string[] = [];
      this.walkNode(mainEl, lines);
      const result = lines
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return result.length > 0 ? result : null;
    } catch {
      return null;
    }
  }

  private walkNode(node: Node, lines: string[]) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || "").trim();
        if (text) {
          lines.push(text);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();

        // 标题 → markdown 格式
        if (/^h[1-6]$/.test(tag)) {
          const level = parseInt(tag[1]);
          const text = (el.textContent || "").trim();
          if (text) {
            lines.push("");
            lines.push("#".repeat(level) + " " + text);
            lines.push("");
          }
          continue;
        }

        // 列表项
        if (tag === "li") {
          const text = (el.textContent || "").trim();
          if (text) {
            lines.push("- " + text);
          }
          continue;
        }

        // 段落
        if (tag === "p") {
          const text = (el.textContent || "").trim();
          if (text) {
            lines.push("");
            lines.push(text);
            lines.push("");
          }
          continue;
        }

        // 链接 → 保留 href
        if (tag === "a") {
          const text = (el.textContent || "").trim();
          const href = el.getAttribute("href");
          if (text && href && !href.startsWith("javascript:")) {
            lines.push(`[${text}](${href})`);
          } else if (text) {
            lines.push(text);
          }
          continue;
        }

        // 代码块
        if (tag === "pre") {
          const text = (el.textContent || "").trim();
          if (text) {
            lines.push("");
            lines.push("```");
            lines.push(text);
            lines.push("```");
            lines.push("");
          }
          continue;
        }

        // 行内代码
        if (tag === "code" && el.parentElement?.tagName.toLowerCase() !== "pre") {
          const text = (el.textContent || "").trim();
          if (text) {
            lines.push("`" + text + "`");
          }
          continue;
        }

        // 换行
        if (tag === "br") {
          lines.push("");
          continue;
        }

        // 分隔线
        if (tag === "hr") {
          lines.push("");
          lines.push("---");
          lines.push("");
          continue;
        }

        // 递归处理其他元素
        this.walkNode(el, lines);

        // 块级元素后添加空行
        if (["div", "section", "blockquote", "table", "figure"].includes(tag)) {
          lines.push("");
        }
      }
    }
  }

  // 带 selector 标注的 HTML 提取，用于 tab 工具
  // 在标题/区块元素旁标注 CSS selector 路径，方便 Agent 后续精确提取
  extractHtmlWithSelectors(html: string): string | null {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const removeSelectors = ["script", "style", "nav", "header", "footer", "aside", "svg", "noscript", "iframe"];
      for (const selector of removeSelectors) {
        doc.querySelectorAll(selector).forEach((el) => el.remove());
      }

      const mainEl = doc.querySelector('main, article, [role="main"]') || doc.body;
      if (!mainEl) return null;

      const lines: string[] = [];
      this.walkNodeWithSelectors(mainEl, lines);
      const result = lines
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return result.length > 0 ? result : null;
    } catch {
      return null;
    }
  }

  // 生成元素的简短 CSS selector 路径
  private buildSelector(el: Element): string {
    if (el.id) return `#${el.id}`;
    const tag = el.tagName.toLowerCase();
    const classes = Array.from(el.classList).slice(0, 2);
    const classStr = classes.length > 0 ? "." + classes.join(".") : "";
    const current = tag + classStr;

    const parent = el.parentElement;
    if (!parent || parent.tagName === "HTML" || parent.tagName === "BODY") {
      return current;
    }
    // 最多向上追溯 2 层
    const parentTag = parent.tagName.toLowerCase();
    if (parent.id) return `#${parent.id} > ${current}`;
    const parentClasses = Array.from(parent.classList).slice(0, 2);
    const parentClassStr = parentClasses.length > 0 ? "." + parentClasses.join(".") : "";
    return parentTag + parentClassStr + " > " + current;
  }

  // 标注 selector 的元素集合
  private static ANNOTATE_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "div", "section", "article", "main"]);

  private walkNodeWithSelectors(node: Node, lines: string[]) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || "").trim();
        if (text) {
          lines.push(text);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();

        // 标题 → markdown + selector 标注
        if (/^h[1-6]$/.test(tag)) {
          const level = parseInt(tag[1]);
          const text = (el.textContent || "").trim();
          if (text) {
            const sel = this.buildSelector(el);
            lines.push("");
            lines.push(`${"#".repeat(level)} ${text} <!-- ${sel} -->`);
            lines.push("");
          }
          continue;
        }

        if (tag === "li") {
          const text = (el.textContent || "").trim();
          if (text) {
            lines.push("- " + text);
          }
          continue;
        }

        if (tag === "p") {
          const text = (el.textContent || "").trim();
          if (text) {
            lines.push("");
            lines.push(text);
            lines.push("");
          }
          continue;
        }

        if (tag === "a") {
          const text = (el.textContent || "").trim();
          const href = el.getAttribute("href");
          if (text && href && !href.startsWith("javascript:")) {
            lines.push(`[${text}](${href})`);
          } else if (text) {
            lines.push(text);
          }
          continue;
        }

        if (tag === "pre") {
          const text = (el.textContent || "").trim();
          if (text) {
            lines.push("");
            lines.push("```");
            lines.push(text);
            lines.push("```");
            lines.push("");
          }
          continue;
        }

        if (tag === "code" && el.parentElement?.tagName.toLowerCase() !== "pre") {
          const text = (el.textContent || "").trim();
          if (text) {
            lines.push("`" + text + "`");
          }
          continue;
        }

        if (tag === "br") {
          lines.push("");
          continue;
        }

        if (tag === "hr") {
          lines.push("");
          lines.push("---");
          lines.push("");
          continue;
        }

        // 区块元素添加 selector 标注
        if (HtmlExtractorService.ANNOTATE_TAGS.has(tag) && !/^h[1-6]$/.test(tag)) {
          const sel = this.buildSelector(el);
          const hasContent = (el.textContent || "").trim().length > 0;
          if (hasContent) {
            lines.push(`<!-- ${sel} -->`);
          }
        }

        this.walkNodeWithSelectors(el, lines);

        if (["div", "section", "blockquote", "table", "figure"].includes(tag)) {
          lines.push("");
        }
      }
    }
  }

  extractSearchResults(html: string): SearchResult[] {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const results: SearchResult[] = [];

      // DuckDuckGo HTML 搜索结果
      const resultEls = doc.querySelectorAll(".result");
      for (const el of Array.from(resultEls)) {
        const linkEl = el.querySelector(".result__a");
        const snippetEl = el.querySelector(".result__snippet");
        if (!linkEl) continue;

        const title = (linkEl.textContent || "").trim();
        let url = linkEl.getAttribute("href") || "";
        // DuckDuckGo 使用重定向 URL，提取实际 URL
        if (url.includes("uddg=")) {
          try {
            const urlObj = new URL(url, "https://duckduckgo.com");
            url = decodeURIComponent(urlObj.searchParams.get("uddg") || url);
          } catch {
            // 保持原始 URL
          }
        }
        const snippet = (snippetEl?.textContent || "").trim();

        if (title && url) {
          results.push({ title, url, snippet });
        }
      }

      return results;
    } catch {
      return [];
    }
  }
}
