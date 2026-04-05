import type { ToolDefinition } from "@App/app/service/agent/types";
import type { ToolExecutor } from "@App/app/service/agent/tool_registry";
import type { MessageSend } from "@Packages/message/types";
import { extractHtmlContent } from "@App/app/service/offscreen/client";

export const WEB_FETCH_DEFINITION: ToolDefinition = {
  name: "web_fetch",
  description:
    "Fetch content from a URL and extract specific information via LLM. Text only — not suitable for binary downloads. " +
    "Always provide a prompt describing what information you need — the raw page content will be processed by LLM to return only relevant information, saving context.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to fetch (http/https)" },
      prompt: {
        type: "string",
        description:
          "Describe what information to extract/summarize from the fetched content. Required for efficient context usage.",
      },
      max_length: { type: "number", description: "Max characters to return (no limit by default)" },
    },
    required: ["url", "prompt"],
  },
};

// 简单正则去 HTML 标签（降级方案）
export function stripHtmlTags(html: string): string {
  if (html.includes("<") && html.includes(">")) {
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ");
  }
  return html.replace(/\s+/g, " ").trim();
}

export class WebFetchExecutor implements ToolExecutor {
  private summarize?: (content: string, prompt: string) => Promise<string>;

  constructor(
    private sender: MessageSend,
    deps?: { summarize?: (content: string, prompt: string) => Promise<string> }
  ) {
    this.summarize = deps?.summarize;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const url = args.url as string;
    const prompt = args.prompt as string | undefined;
    const maxLength = args.max_length as number | undefined;

    if (!url) {
      throw new Error("url is required");
    }

    // 校验 URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Only http/https URLs are supported");
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScriptCat Agent)" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 检测重定向：最终 URL 与请求 URL 不同
    const finalUrl = response.url && response.url !== url ? response.url : undefined;

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let content: string;
    let detectedType: string = "";

    // a) Content-Type 含 json → 尝试 JSON.parse
    if (contentType.includes("json")) {
      try {
        if (text && typeof text === "string") {
          const parsed = JSON.parse(text);
          if (Object.keys(parsed).length) {
            content = JSON.stringify(parsed, null, 2);
            detectedType = "json";
          }
        }
      } catch {
        // 不是有效 JSON
      }
      if (detectedType !== "json") {
        // 不是有效 JSON，当作纯文本
        content = stripHtmlTags(text);
        detectedType = "text";
      }
    }
    // b) Content-Type 含 html 或未知 → 送 Offscreen extractHtmlContent
    else if (contentType.includes("html") || !contentType) {
      try {
        const extracted = await extractHtmlContent(this.sender, text);
        if (extracted && extracted.length > 50) {
          content = extracted;
          detectedType = "html";
        } else {
          // 提取结果太短，降级到纯文本
          content = stripHtmlTags(text);
          detectedType = "text";
        }
      } catch {
        // Offscreen 提取失败，降级
        content = stripHtmlTags(text);
        detectedType = "text";
      }
    }
    // c) 其他类型 → 纯文本
    else {
      content = text;
      detectedType = "text";
    }

    // 截断（仅当显式传入 max_length 时）
    let truncated = maxLength != null && content.length > maxLength;
    if (truncated) {
      content = content.slice(0, maxLength);
    }

    // LLM 摘要
    if (prompt && this.summarize) {
      content = await this.summarize(content, prompt);
      truncated = false;
    }

    const result: Record<string, unknown> = {
      url,
      content_type: detectedType,
      content,
      truncated,
    };
    if (finalUrl) {
      result.final_url = finalUrl;
    }
    return JSON.stringify(result);
  }
}
