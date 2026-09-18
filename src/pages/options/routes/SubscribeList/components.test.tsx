import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({ systemConfig: { get } });
});

vi.mock("@App/pages/store/features/subscribe", () => ({
  requestCheckSubscribeUpdate: vi.fn(() => Promise.resolve(false)),
}));

import { initTestLanguage } from "@Tests/initTestLanguage";
import { TooltipProvider } from "@App/pages/components/ui/tooltip";
import { PermissionFavicons } from "./components";

beforeAll(() => {
  initTestLanguage("zh-CN");
});

afterEach(() => {
  cleanup();
  get.mockReset();
});

const renderFavicons = () =>
  render(
    <TooltipProvider>
      <PermissionFavicons connect={["example.com"]} />
    </TooltipProvider>
  );

describe("订阅 @connect 域名图标", () => {
  it("图标服务可用时以站点 favicon 呈现", async () => {
    get.mockResolvedValue("scriptcat");
    renderFavicons();

    const img = await screen.findByAltText("example.com");
    expect(img).toHaveAttribute("src", "https://example.com/favicon.ico");
  });

  it("图标服务禁用时不向站点请求 favicon", async () => {
    get.mockResolvedValue("none");
    const { container } = renderFavicons();

    // 配置读取是异步的：等到读取完成后仍不能出现 <img>，否则请求早已发出
    await waitFor(() => expect(get).toHaveBeenCalledWith("favicon_service"));
    expect(container.querySelector("img")).toBeNull();
  });
});
