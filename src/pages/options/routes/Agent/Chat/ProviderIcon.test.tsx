import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ProviderIcon from "./ProviderIcon";

afterEach(cleanup);

describe("ProviderIcon 模型供应商徽标", () => {
  it("使用设计令牌文本色而不是内联品牌色", () => {
    render(<ProviderIcon providerKey="openai" size={18} />);
    const icon = screen.getByTestId("provider-icon");
    expect(icon).toHaveTextContent("AI");
    expect(icon.className).toMatch(/text-label-\w+-fg/);
    expect(icon.getAttribute("style") || "").not.toMatch(/color:\s*(#|rgb|hsl)/);
  });

  it("未知供应商回退到 AI 文本并保留原始 data-provider", () => {
    render(<ProviderIcon providerKey="unknown" />);
    const icon = screen.getByTestId("provider-icon");
    expect(icon).toHaveTextContent("AI");
    expect(icon).toHaveAttribute("data-provider", "unknown");
  });
});
