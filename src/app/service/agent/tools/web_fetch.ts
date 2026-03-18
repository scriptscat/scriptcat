import type { ToolDefinition } from "@App/app/service/agent/types";
import type { ToolExecutor } from "@App/app/service/agent/tool_registry";
import type { MessageSend } from "@Packages/message/types";
import { extractHtmlContent } from "@App/app/service/offscreen/client";

export const WEB_FETCH_DEFINITION: ToolDefinition = {
  name: "web_fetch",
  description:
    "Fetch content from a URL. Returns extracted text for HTML pages, raw content for JSON/plain text. Use this to read web pages, APIs, or download text content.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to fetch (http/https)" },
      max_length: { type: "number", description: "Max characters to return (default 10000)" },
    },
    required: ["url"],
  },
};

// 简单正则去 HTML 标签（降级方案）
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class WebFetchExecutor implements ToolExecutor {
  constructor(private sender: MessageSend) {}

  async execute(args: Record<string, unknown>): Promise<string> {
    const url = args.url as string;
    const maxLength = (args.max_length as number) || 10000;

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

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let content: string;
    let detectedType: string;

    // a) Content-Type 含 json → 尝试 JSON.parse
    if (contentType.includes("json")) {
      try {
        const parsed = JSON.parse(text);
        content = JSON.stringify(parsed, null, 2);
        detectedType = "json";
      } catch {
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

    // 截断
    const truncated = content.length > maxLength;
    if (truncated) {
      content = content.slice(0, maxLength);
    }

    return JSON.stringify({
      url,
      content_type: detectedType,
      content,
      truncated,
    });
  }
}
