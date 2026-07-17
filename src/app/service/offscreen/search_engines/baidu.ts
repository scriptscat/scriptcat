import type { SearchEngine, SearchResult } from "./types";
import { searchEngineRegistry } from "./registry";

/** 百度搜索结果解析器 */
export const baiduEngine: SearchEngine = {
  name: "baidu",

  extract(doc: Document): SearchResult[] {
    const results: SearchResult[] = [];

    const resultEls = doc.querySelectorAll(".result, .result-op");
    for (const el of Array.from(resultEls)) {
      const linkEl = el.querySelector(".t > a, h3 > a");
      const snippetEl = el.querySelector(".c-abstract, .c-span-last");
      if (!linkEl) continue;

      const title = (linkEl.textContent || "").trim();
      const url = linkEl.getAttribute("href") || "";
      const snippet = (snippetEl?.textContent || "").trim();

      if (title && url) {
        results.push({ title, url, snippet });
      }
    }

    return results;
  },
};

searchEngineRegistry.register(baiduEngine);
