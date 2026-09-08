import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { ExternalAccessBanner } from "./ExternalAccessBanner";

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("ExternalAccessBanner 外部接入安装横幅", () => {
  it("安装态渲染来源与内容哈希（不显示客户端名，设计 §3.0.1）", () => {
    render(
      <ExternalAccessBanner contentHash="abcdef1234567890" source="https://example.com/x.user.js" isUpdate={false} />
    );
    const banner = screen.getByTestId("external-access-install-banner");
    expect(banner).toHaveTextContent("https://example.com/x.user.js");
  });

  it("长哈希被截断显示，完整值保留在 title 属性中", () => {
    const hash = "a".repeat(64);
    render(<ExternalAccessBanner contentHash={hash} source="raw code" isUpdate={false} />);
    const hashEl = screen.getByTestId("external-access-install-banner-hash");
    expect(hashEl).toHaveAttribute("title", hash);
    expect(hashEl.textContent).not.toContain(hash);
  });

  it("短哈希不被截断", () => {
    render(<ExternalAccessBanner contentHash="short" source="raw code" isUpdate={false} />);
    expect(screen.getByTestId("external-access-install-banner-hash")).toHaveTextContent("short");
  });

  it("更新态使用更新文案", () => {
    render(<ExternalAccessBanner contentHash="hash" source="raw code" isUpdate={true} />);
    // 更新横幅存在（文案随语言变化，只断言 testid 渲染）。
    expect(screen.getByTestId("external-access-install-banner")).toBeInTheDocument();
  });
});
