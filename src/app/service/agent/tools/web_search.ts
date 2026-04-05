import type { ToolDefinition } from "@App/app/service/agent/types";
import type { ToolExecutor } from "@App/app/service/agent/tool_registry";
import type { MessageSend } from "@Packages/message/types";
import type { SearchConfigRepo } from "./search_config";
import { extractSearchResults, extractBingResults, extractBaiduResults } from "@App/app/service/offscreen/client";
import { withTimeout } from "@App/pkg/utils/with_timeout";

export const WEB_SEARCH_DEFINITION: ToolDefinition = {
  name: "web_search",
  description:
    "Search the web for information. Returns a list of results with title, URL, and snippet. Use this to find up-to-date information.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      max_results: { type: "number", description: "Max results to return (default 5, max 10)" },
    },
    required: ["query"],
  },
};

/** 格式化搜索结果，区分"无结果"和"提取失败" */
function formatSearchResults(
  results: Array<{ title: string; url: string; snippet: string }>,
  extractionFailed: boolean,
  engine: string
): string {
  if (extractionFailed && results.length === 0) {
    return JSON.stringify({
      results: [],
      warning: `Result extraction failed or timed out (engine: ${engine}). Try a different search engine or rephrase the query.`,
    });
  }
  return JSON.stringify(results);
}

export class WebSearchExecutor implements ToolExecutor {
  constructor(
    private sender: MessageSend,
    private configRepo: SearchConfigRepo
  ) {}

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = args.query as string;
    const maxResults = Math.min((args.max_results as number) || 5, 10);

    if (!query) {
      throw new Error("query is required");
    }

    const config = await this.configRepo.getConfig();

    switch (config.engine) {
      case "google_custom":
        return this.searchGoogle(query, maxResults, config.googleApiKey || "", config.googleCseId || "");
      case "duckduckgo":
        return this.searchDuckDuckGo(query, maxResults);
      case "baidu":
        return this.searchBaidu(query, maxResults);
      case "bing":
      default:
        return this.searchBing(query, maxResults);
    }
  }

  private async searchDuckDuckGo(query: string, maxResults: number): Promise<string> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ScriptCat Agent)",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`);
    }

    const html = await response.text();

    // extractSearchResults 走 Offscreen 通道，加 10s 超时防卡死
    let results: Awaited<ReturnType<typeof extractSearchResults>>;
    let extractionFailed = false;
    try {
      results = await withTimeout(
        extractSearchResults(this.sender, html),
        10_000,
        () => new Error("extract timeout")
      );
    } catch {
      results = [];
      extractionFailed = true;
    }

    return formatSearchResults(results.slice(0, maxResults), extractionFailed, "duckduckgo");
  }

  private async searchBing(query: string, maxResults: number): Promise<string> {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ScriptCat Agent)",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Bing search failed: HTTP ${response.status}`);
    }

    const html = await response.text();

    let results: Awaited<ReturnType<typeof extractBingResults>>;
    let extractionFailed = false;
    try {
      results = await withTimeout(
        extractBingResults(this.sender, html),
        10_000,
        () => new Error("extract timeout")
      );
    } catch {
      results = [];
      extractionFailed = true;
    }

    return formatSearchResults(results.slice(0, maxResults), extractionFailed, "bing");
  }

  private async searchBaidu(query: string, maxResults: number): Promise<string> {
    const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${maxResults}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ScriptCat Agent)",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Baidu search failed: HTTP ${response.status}`);
    }

    const html = await response.text();

    let results: Awaited<ReturnType<typeof extractBaiduResults>>;
    let extractionFailed = false;
    try {
      results = await withTimeout(
        extractBaiduResults(this.sender, html),
        10_000,
        () => new Error("extract timeout")
      );
    } catch {
      results = [];
      extractionFailed = true;
    }

    return formatSearchResults(results.slice(0, maxResults), extractionFailed, "baidu");
  }

  private async searchGoogle(query: string, maxResults: number, apiKey: string, cseId: string): Promise<string> {
    if (!apiKey || !cseId) {
      throw new Error("Google Custom Search requires API Key and CSE ID. Configure them in Agent Tool Settings.");
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cseId)}&q=${encodeURIComponent(query)}&num=${maxResults}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Google search failed: HTTP ${response.status} ${text.slice(0, 200)}`);
    }

    const data = await response.json();
    const results = (data.items || []).map((item: any) => ({
      title: item.title || "",
      url: item.link || "",
      snippet: item.snippet || "",
    }));

    return JSON.stringify(results.slice(0, maxResults));
  }
}
