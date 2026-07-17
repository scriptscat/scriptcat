import type { SearchEngine, SearchResult } from "./types";
import { searchEngineRegistry } from "./registry";

/** Bing 搜索结果解析器 */
export const bingEngine: SearchEngine = {
  name: "bing",

  extract(doc: Document): SearchResult[] {
    const results: SearchResult[] = [];

    const resultEls = doc.querySelectorAll(".b_algo");
    for (const el of Array.from(resultEls)) {
      const linkEl = el.querySelector("h2 > a");
      const snippetEl = el.querySelector(".b_caption p, p");
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

searchEngineRegistry.register(bingEngine);
