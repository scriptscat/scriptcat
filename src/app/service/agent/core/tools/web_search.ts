import type { ToolDefinition } from "@App/app/service/agent/core/types";
import type { ToolExecutor } from "@App/app/service/agent/core/tool_registry";
import type { MessageSend } from "@Packages/message/types";
import type { SearchConfigRepo } from "./search_config";
import { extractSearchResults, extractBingResults, extractBaiduResults } from "@App/app/service/offscreen/client";
import { withTimeout } from "@App/pkg/utils/with_timeout";
import { requireString, optionalNumber } from "./param_utils";

// Agent User-Agent 字符串
const AGENT_USER_AGENT = "Mozilla/5.0 (compatible; ScriptCat Agent)";
// 搜索超时时间（毫秒）
const SEARCH_TIMEOUT_MS = 15_000;

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

/** 搜索结果条目类型 */
type SearchResult = { title: string; url: string; snippet: string };

export class WebSearchExecutor implements ToolExecutor {
  constructor(
    private sender: MessageSend,
    private configRepo: SearchConfigRepo
  ) {}

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = requireString(args, "query");
    const maxResults = Math.min(optionalNumber(args, "max_results") ?? 5, 10);

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

  /**
   * 搜索引擎通用执行模板：fetch HTML → 提取结果 → 格式化
   * @param url 搜索请求 URL
   * @param extractFn 结果提取函数（接收 HTML 字符串，返回结果数组的 Promise）
   * @param engineName 引擎名称（用于错误提示）
   * @param maxResults 最大返回条数
   */
  private async fetchAndExtract(
    url: string,
    extractFn: (html: string) => Promise<SearchResult[]>,
    engineName: string,
    maxResults: number
  ): Promise<string> {
    const response = await fetch(url, {
      headers: { "User-Agent": AGENT_USER_AGENT },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`${engineName} search failed: HTTP ${response.status}`);
    }
    const html = await response.text();
    let results: SearchResult[] = [];
    let extractionFailed = false;
    try {
      // 提取函数走 Offscreen 通道，加 10s 超时防卡死
      results = await withTimeout(extractFn(html), 10_000, () => new Error("extract timeout"));
    } catch {
      extractionFailed = true;
    }
    return formatSearchResults(results.slice(0, maxResults), extractionFailed, engineName);
  }

  private async searchDuckDuckGo(query: string, maxResults: number): Promise<string> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    return this.fetchAndExtract(url, (html) => extractSearchResults(this.sender, html), "DuckDuckGo", maxResults);
  }

  private async searchBing(query: string, maxResults: number): Promise<string> {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    return this.fetchAndExtract(url, (html) => extractBingResults(this.sender, html), "Bing", maxResults);
  }

  private async searchBaidu(query: string, maxResults: number): Promise<string> {
    const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${maxResults}`;
    return this.fetchAndExtract(url, (html) => extractBaiduResults(this.sender, html), "Baidu", maxResults);
  }

  private async searchGoogle(query: string, maxResults: number, apiKey: string, cseId: string): Promise<string> {
    if (!apiKey || !cseId) {
      throw new Error("Google Custom Search requires API Key and CSE ID. Configure them in Agent Tool Settings.");
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cseId)}&q=${encodeURIComponent(query)}&num=${maxResults}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });

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
