import type { SearchEngine, SearchResult } from "./types";
import { searchEngineRegistry } from "./registry";

/** DuckDuckGo HTML 搜索结果解析器 */
export const duckduckgoEngine: SearchEngine = {
  name: "duckduckgo",

  extract(doc: Document): SearchResult[] {
    const results: SearchResult[] = [];

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
  },
};

searchEngineRegistry.register(duckduckgoEngine);
