import { describe, it, expect } from "vitest";
import { duckduckgoEngine } from "./duckduckgo";

/** 用 DOMParser 从 HTML 字符串构建 Document */
function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("duckduckgoEngine", () => {
  it("引擎名为 duckduckgo", () => {
    expect(duckduckgoEngine.name).toBe("duckduckgo");
  });

  it("从标准 DuckDuckGo HTML 中提取结果", () => {
    const html = `
      <html><body>
        <div class="result">
          <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com">Example Title</a>
          <div class="result__snippet">Example snippet</div>
        </div>
        <div class="result">
          <a class="result__a" href="https://direct.com">Direct Title</a>
          <div class="result__snippet">Direct snippet</div>
        </div>
      </body></html>`;

    const results = duckduckgoEngine.extract(parseHtml(html));
    expect(results).toHaveLength(2);
    // 第一个结果应该解析重定向 URL
    expect(results[0].title).toBe("Example Title");
    expect(results[0].url).toBe("https://example.com");
    expect(results[0].snippet).toBe("Example snippet");
    // 第二个没有重定向，保持原始 URL
    expect(results[1].url).toBe("https://direct.com");
  });

  it("没有 .result 元素时返回空数组", () => {
    const html = `<html><body><p>No results</p></body></html>`;
    expect(duckduckgoEngine.extract(parseHtml(html))).toEqual([]);
  });

  it("跳过没有 .result__a 链接的 .result 元素", () => {
    const html = `
      <html><body>
        <div class="result">
          <a href="https://example.com">普通链接，无 result__a class</a>
        </div>
      </body></html>`;
    expect(duckduckgoEngine.extract(parseHtml(html))).toEqual([]);
  });

  it("snippet 为空时仍返回结果", () => {
    const html = `
      <html><body>
        <div class="result">
          <a class="result__a" href="https://example.com">Title Only</a>
        </div>
      </body></html>`;
    const results = duckduckgoEngine.extract(parseHtml(html));
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toBe("");
  });

  it("uddg 参数解析失败时保留原始 URL", () => {
    const html = `
      <html><body>
        <div class="result">
          <a class="result__a" href="/l/?uddg=not-a-valid-encoded-url">Title</a>
          <div class="result__snippet">Snippet</div>
        </div>
      </body></html>`;
    const results = duckduckgoEngine.extract(parseHtml(html));
    expect(results).toHaveLength(1);
    // URL 不为空（保留了原始值）
    expect(results[0].url).toBeTruthy();
  });
});
