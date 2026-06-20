import { describe, it, expect } from "vitest";
import { baiduEngine } from "./baidu";

/** 用 DOMParser 从 HTML 字符串构建 Document */
function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("baiduEngine", () => {
  it("引擎名为 baidu", () => {
    expect(baiduEngine.name).toBe("baidu");
  });

  it("从标准百度 HTML 中提取结果", () => {
    const html = `
      <html><body>
        <div class="result">
          <h3 class="t"><a href="https://example.com">百度结果标题</a></h3>
          <div class="c-abstract">这是摘要文本</div>
        </div>
        <div class="result-op">
          <div class="t"><a href="https://another.com">另一个标题</a></div>
          <span class="c-span-last">另一个摘要</span>
        </div>
      </body></html>`;

    const results = baiduEngine.extract(parseHtml(html));
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "百度结果标题",
      url: "https://example.com",
      snippet: "这是摘要文本",
    });
    expect(results[1].title).toBe("另一个标题");
    expect(results[1].url).toBe("https://another.com");
  });

  it("没有 .result 元素时返回空数组", () => {
    const html = `<html><body><p>无结果</p></body></html>`;
    expect(baiduEngine.extract(parseHtml(html))).toEqual([]);
  });

  it("跳过没有链接的 .result 元素", () => {
    const html = `
      <html><body>
        <div class="result">
          <p>没有链接</p>
        </div>
      </body></html>`;
    expect(baiduEngine.extract(parseHtml(html))).toEqual([]);
  });

  it("snippet 为空时仍返回结果", () => {
    const html = `
      <html><body>
        <div class="result">
          <h3><a href="https://example.com">仅标题</a></h3>
        </div>
      </body></html>`;
    const results = baiduEngine.extract(parseHtml(html));
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toBe("");
  });
});
