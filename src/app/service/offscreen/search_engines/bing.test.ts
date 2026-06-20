import { describe, it, expect } from "vitest";
import { bingEngine } from "./bing";

/** 用 DOMParser 从 HTML 字符串构建 Document */
function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("bingEngine", () => {
  it("引擎名为 bing", () => {
    expect(bingEngine.name).toBe("bing");
  });

  it("从标准 Bing HTML 中提取结果", () => {
    const html = `
      <html><body>
        <li class="b_algo">
          <h2><a href="https://example.com">Example Title</a></h2>
          <div class="b_caption"><p>Example snippet text</p></div>
        </li>
        <li class="b_algo">
          <h2><a href="https://another.com">Another Title</a></h2>
          <p>Another snippet</p>
        </li>
      </body></html>`;

    const results = bingEngine.extract(parseHtml(html));
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "Example Title",
      url: "https://example.com",
      snippet: "Example snippet text",
    });
    expect(results[1].title).toBe("Another Title");
    expect(results[1].url).toBe("https://another.com");
  });

  it("没有 .b_algo 元素时返回空数组", () => {
    const html = `<html><body><p>No results</p></body></html>`;
    expect(bingEngine.extract(parseHtml(html))).toEqual([]);
  });

  it("跳过没有链接的 .b_algo 元素", () => {
    const html = `
      <html><body>
        <li class="b_algo">
          <h2>No link here</h2>
        </li>
      </body></html>`;
    expect(bingEngine.extract(parseHtml(html))).toEqual([]);
  });

  it("snippet 为空时仍返回结果", () => {
    const html = `
      <html><body>
        <li class="b_algo">
          <h2><a href="https://example.com">Title Only</a></h2>
        </li>
      </body></html>`;
    const results = bingEngine.extract(parseHtml(html));
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toBe("");
  });
});
