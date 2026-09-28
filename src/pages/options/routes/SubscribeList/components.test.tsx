import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { act, render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

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
import { t } from "@App/locales/locales";
import { requestCheckSubscribeUpdate } from "@App/pages/store/features/subscribe";
import { PermissionFavicons, SubscribeUpdateTimeCell } from "./components";

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

describe("订阅更新时间格的检查更新状态", () => {
  const URL = "https://example.com/list.user.sub.js";
  const renderCell = (updatetime: number) => (
    <TooltipProvider>
      <SubscribeUpdateTimeCell url={URL} updatetime={updatetime} />
    </TooltipProvider>
  );
  const clickCheck = () =>
    act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("check_update") }));
    });

  it("已静默更新时不提示「存在新版本」", async () => {
    vi.mocked(requestCheckSubscribeUpdate).mockResolvedValueOnce("updated");
    render(renderCell(1000));

    await clickCheck();

    expect(requestCheckSubscribeUpdate).toHaveBeenCalledWith(URL);
    expect(screen.queryByText(t("script:new_version_available"))).toBeNull();
    expect(screen.queryByText(t("script:latest_version"))).toBeNull();
  });

  it("打开安装页待确认时提示「存在新版本」，订阅更新后恢复为更新时间", async () => {
    vi.mocked(requestCheckSubscribeUpdate).mockResolvedValueOnce("confirm");
    const { rerender } = render(renderCell(1000));

    await clickCheck();
    expect(screen.getByText(t("script:new_version_available"))).toBeInTheDocument();

    rerender(renderCell(2000));

    expect(screen.queryByText(t("script:new_version_available"))).toBeNull();
  });

  it("检查期间订阅更新时间变化后忽略过期的确认结果", async () => {
    let resolveCheck!: (result: "confirm") => void;
    const pendingCheck = new Promise<"confirm">((resolve) => {
      resolveCheck = resolve;
    });
    vi.mocked(requestCheckSubscribeUpdate).mockReturnValueOnce(pendingCheck);
    const { rerender } = render(renderCell(1000));

    await clickCheck();
    rerender(renderCell(2000));

    await act(async () => {
      resolveCheck("confirm");
      await pendingCheck;
    });

    expect(screen.queryByText(t("script:new_version_available"))).toBeNull();
  });

  it("订阅更新时间变化后重置已是最新状态", async () => {
    vi.mocked(requestCheckSubscribeUpdate).mockResolvedValueOnce(false);
    const { rerender } = render(renderCell(1000));

    await clickCheck();
    expect(screen.getByText(t("script:latest_version"))).toBeInTheDocument();

    rerender(renderCell(2000));

    expect(screen.queryByText(t("script:latest_version"))).toBeNull();
    expect(screen.getByRole("button", { name: t("check_update") })).toBeInTheDocument();
  });
});
