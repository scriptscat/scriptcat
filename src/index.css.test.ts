import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// 全局 outline:none 若作用于裸 :focus，会连键盘导航的可见焦点一并屏蔽，伤害可访问性。
// 应只在「非键盘聚焦」(:focus:not(:focus-visible)) 时屏蔽，保留键盘 :focus-visible 的可见焦点。
describe("全局焦点 outline 可访问性", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");

  it("不得对裸 button:focus / [role=button]:focus / a:focus 做 outline:none", () => {
    expect(css).not.toMatch(/button:focus\s*,/);
    expect(css).not.toMatch(/\[role="button"\]:focus\s*,/);
    expect(css).not.toMatch(/a:focus\s*\{/);
  });

  it("应将 outline:none 限定到 :focus:not(:focus-visible)，保留键盘可见焦点", () => {
    expect(css).toMatch(/button:focus:not\(:focus-visible\)/);
    expect(css).toMatch(/\[role="button"\]:focus:not\(:focus-visible\)/);
    expect(css).toMatch(/a:focus:not\(:focus-visible\)/);
  });
});
