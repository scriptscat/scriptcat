import type { ToolDefinition } from "@App/app/service/agent/types";
import type { ToolExecutor } from "@App/app/service/agent/tool_registry";
import type { MessageSend } from "@Packages/message/types";
import type { SearchConfigRepo } from "./search_config";
import { extractSearchResults } from "@App/app/service/offscreen/client";

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
      default:
        return this.searchDuckDuckGo(query, maxResults);
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
    try {
      results = await Promise.race([
        extractSearchResults(this.sender, html),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("extract timeout")), 10_000)),
      ]);
    } catch {
      // 超时或提取失败，降级返回空数组
      results = [];
    }

    return JSON.stringify(results.slice(0, maxResults));
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
