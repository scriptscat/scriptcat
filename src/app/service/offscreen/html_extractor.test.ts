import { describe, it, expect } from "vitest";
import { HtmlExtractorService } from "./html_extractor";

// 创建不需要消息通道的 HtmlExtractorService 实例
function createService(): HtmlExtractorService {
  return new HtmlExtractorService({} as any);
}

describe("extractHtmlWithSelectors", () => {
  it("should extract content with selector annotations on headings", () => {
    const service = createService();
    const html = `<html><body>
      <div id="main">
        <h1>Page Title</h1>
        <p>Some content here</p>
        <h2 class="subtitle">Section A</h2>
        <p>Section A content</p>
      </div>
    </body></html>`;

    const result = service.extractHtmlWithSelectors(html);
    expect(result).not.toBeNull();
    // 标题应该有 selector 注释
    expect(result).toContain("# Page Title <!-- ");
    expect(result).toContain("## Section A <!-- ");
    expect(result).toContain("Some content here");
    expect(result).toContain("Section A content");
  });

  it("should annotate div/section elements with selectors", () => {
    const service = createService();
    const html = `<html><body>
      <section id="products">
        <p>Product list</p>
      </section>
    </body></html>`;

    const result = service.extractHtmlWithSelectors(html);
    expect(result).not.toBeNull();
    expect(result).toContain("<!-- #products -->");
    expect(result).toContain("Product list");
  });

  it("should use id-based selector when element has id", () => {
    const service = createService();
    const html = `<html><body>
      <h2 id="price-section">Pricing</h2>
    </body></html>`;

    const result = service.extractHtmlWithSelectors(html);
    expect(result).toContain("## Pricing <!-- #price-section -->");
  });

  it("should use parent > child selector with classes", () => {
    const service = createService();
    const html = `<html><body>
      <div class="container">
        <h3 class="info-title">Info</h3>
      </div>
    </body></html>`;

    const result = service.extractHtmlWithSelectors(html);
    expect(result).not.toBeNull();
    // 应该是 div.container > h3.info-title 这样的格式
    expect(result).toContain("### Info <!-- div.container > h3.info-title -->");
  });

  it("should use parent id shortcut in selector", () => {
    const service = createService();
    const html = `<html><body>
      <div id="wrapper">
        <h2 class="title">Hello</h2>
      </div>
    </body></html>`;

    const result = service.extractHtmlWithSelectors(html);
    expect(result).toContain("## Hello <!-- #wrapper > h2.title -->");
  });

  it("should handle links, lists, code blocks same as walkNode", () => {
    const service = createService();
    const html = `<html><body>
      <ul>
        <li>Item 1</li>
        <li>Item 2</li>
      </ul>
      <a href="https://example.com">Link</a>
      <pre>code block</pre>
      <code>inline code</code>
    </body></html>`;

    const result = service.extractHtmlWithSelectors(html);
    expect(result).not.toBeNull();
    expect(result).toContain("- Item 1");
    expect(result).toContain("- Item 2");
    expect(result).toContain("[Link](https://example.com)");
    expect(result).toContain("```\ncode block\n```");
    expect(result).toContain("`inline code`");
  });

  it("should remove script/style/nav/header/footer/aside/svg/noscript/iframe", () => {
    const service = createService();
    const html = `<html><body>
      <nav>Navigation</nav>
      <header>Header</header>
      <main>
        <p>Main content</p>
      </main>
      <footer>Footer</footer>
      <script>alert(1)</script>
      <style>.x{}</style>
    </body></html>`;

    const result = service.extractHtmlWithSelectors(html);
    expect(result).not.toBeNull();
    expect(result).toContain("Main content");
    expect(result).not.toContain("Navigation");
    expect(result).not.toContain("Header");
    expect(result).not.toContain("Footer");
    expect(result).not.toContain("alert");
  });

  it("should return null for empty body", () => {
    const service = createService();
    const html = `<html><body></body></html>`;

    const result = service.extractHtmlWithSelectors(html);
    expect(result).toBeNull();
  });

  it("should return null for invalid HTML", () => {
    const service = createService();
    // DOMParser 通常不会抛错，但如果 catch 被触发应该返回 null
    // 这里测试空字符串
    const result = service.extractHtmlWithSelectors("");
    // DOMParser 对空字符串会创建空 body
    expect(result).toBeNull();
  });

  it("should not annotate empty div/section elements", () => {
    const service = createService();
    const html = `<html><body>
      <div id="empty"></div>
      <div id="has-content"><p>content</p></div>
    </body></html>`;

    const result = service.extractHtmlWithSelectors(html);
    expect(result).not.toBeNull();
    expect(result).not.toContain("#empty");
    expect(result).toContain("#has-content");
  });

  it("should handle br and hr elements", () => {
    const service = createService();
    const html = `<html><body>
      <p>Before</p>
      <hr>
      <p>After</p>
    </body></html>`;

    const result = service.extractHtmlWithSelectors(html);
    expect(result).not.toBeNull();
    expect(result).toContain("---");
    expect(result).toContain("Before");
    expect(result).toContain("After");
  });

  it("should limit class names to 2 in selector", () => {
    const service = createService();
    const html = `<html><body>
      <h2 class="cls1 cls2 cls3 cls4">Title</h2>
    </body></html>`;

    const result = service.extractHtmlWithSelectors(html);
    expect(result).not.toBeNull();
    // 最多取 2 个 class
    expect(result).toContain("h2.cls1.cls2");
    expect(result).not.toContain("cls3");
  });
});
