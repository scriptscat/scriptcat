import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ScriptIcon } from "./components";

afterEach(cleanup);

describe("ScriptIcon 脚本图标", () => {
  it("直接提供 iconUrl 时应渲染对应的 img", () => {
    const { container } = render(<ScriptIcon name="Test" iconUrl="https://example.com/icon.png" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/icon.png");
  });

  it("iconUrl 优先于 metadata 提取的图标", () => {
    const { container } = render(
      <ScriptIcon name="Test" iconUrl="https://example.com/a.png" metadata={{ icon: ["https://example.com/b.png"] }} />
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.com/a.png");
  });

  it("无任何图标时回退到首字母头像（不渲染 img）", () => {
    const { container } = render(<ScriptIcon name="Hello" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("H");
  });

  it("支持自定义尺寸 size", () => {
    const { container } = render(<ScriptIcon name="Test" iconUrl="https://example.com/icon.png" size={20} />);
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.style.width).toBe("20px");
    expect(img.style.height).toBe("20px");
  });
});
