import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { renderGuideContent } from "./guide-content";

afterEach(cleanup);

describe("引导文案渲染", () => {
  it("应把 Link 标签渲染成新窗口打开的链接", () => {
    render(<div>{renderGuideContent('前往<Link href="https://scriptcat.org/search">脚本市场</Link>看看')}</div>);
    const a = screen.getByRole("link", { name: "脚本市场" });
    expect(a).toHaveAttribute("href", "https://scriptcat.org/search");
    expect(a).toHaveAttribute("target", "_blank");
    expect(screen.getByText(/前往/)).toBeInTheDocument();
    expect(screen.getByText(/看看/)).toBeInTheDocument();
  });

  it("无 Link 标签时应原样返回纯文本", () => {
    render(<div>{renderGuideContent("普通文案")}</div>);
    expect(screen.getByText("普通文案")).toBeInTheDocument();
  });
});
