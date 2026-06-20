import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, cleanup, screen, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { initLanguage, t } from "@App/locales/locales";

// 资源数据走后台消息，统一打桩；用 hoisted 以便在 vi.mock 工厂内引用
const { fetchScript, getScriptResources, deleteResource } = vi.hoisted(() => ({
  fetchScript: vi.fn(),
  getScriptResources: vi.fn(),
  deleteResource: vi.fn(),
}));
vi.mock("@App/pages/store/features/script", () => ({
  fetchScript,
  resourceClient: { getScriptResources, deleteResource },
}));

import ResourcePane, { invalidateResourcePane, usePreloadResourcePane } from "./ResourcePane";

const sampleResources = () => ({
  "https://cdn.test/jquery.min.js": {
    url: "https://cdn.test/jquery.min.js",
    type: "require",
    contentType: "application/javascript",
    content: "var a=1;",
    base64: "",
  },
  "https://cdn.test/theme.css": {
    url: "https://cdn.test/theme.css",
    type: "resource",
    contentType: "text/css",
    content: "body{}",
    base64: "",
  },
});

beforeEach(() => {
  initLanguage("zh-CN");
  vi.clearAllMocks();
  fetchScript.mockResolvedValue({ uuid: "u1", name: "脚本A" });
  getScriptResources.mockResolvedValue(sampleResources());
  deleteResource.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  invalidateResourcePane();
  vi.restoreAllMocks();
});

describe("ResourcePane 资源面板", () => {
  it("应加载并展示资源（文件名 + 类型 + @require/@resource 徽标）", async () => {
    render(<ResourcePane uuid="u1" />);
    expect(await screen.findByText("jquery.min.js")).toBeInTheDocument();
    expect(screen.getByText("theme.css")).toBeInTheDocument();
    expect(screen.getByText("@require")).toBeInTheDocument();
    expect(screen.getByText("@resource")).toBeInTheDocument();
    expect(screen.getByText("application/javascript")).toBeInTheDocument();
  });

  it("行内删除应调用 resourceClient.deleteResource 并移除该行", async () => {
    render(<ResourcePane uuid="u1" />);
    await screen.findByText("jquery.min.js");
    const delButtons = screen.getAllByRole("button", { name: t("delete") });
    fireEvent.click(delButtons[0]);
    await waitFor(() => expect(deleteResource).toHaveBeenCalledWith("https://cdn.test/jquery.min.js"));
    await waitFor(() => expect(screen.queryByText("jquery.min.js")).toBeNull());
  });

  it("清空应对每个资源调用删除并清空列表", async () => {
    render(<ResourcePane uuid="u1" />);
    await screen.findByText("jquery.min.js");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(t("clear")) }));
    fireEvent.click(screen.getByRole("button", { name: t("confirm") }));
    await waitFor(() => expect(deleteResource).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(t("no_data"))).toBeInTheDocument());
  });

  it("搜索应按文件名过滤资源", async () => {
    render(<ResourcePane uuid="u1" />);
    await screen.findByText("jquery.min.js");
    fireEvent.change(screen.getByPlaceholderText(t("editor:search_resource")), { target: { value: "theme" } });
    expect(screen.queryByText("jquery.min.js")).toBeNull();
    expect(screen.getByText("theme.css")).toBeInTheDocument();
  });

  it("无资源时应展示空状态", async () => {
    getScriptResources.mockResolvedValue({});
    render(<ResourcePane uuid="u1" />);
    expect(await screen.findByText(t("no_data"))).toBeInTheDocument();
  });

  it("卸载后重挂载同一脚本应复用预加载资源", async () => {
    const first = render(<ResourcePane uuid="u1" />);
    await screen.findByText("jquery.min.js");
    first.unmount();
    render(<ResourcePane uuid="u1" />);

    expect(screen.getByText("jquery.min.js")).toBeInTheDocument();
    expect(getScriptResources).toHaveBeenCalledOnce();
  });

  it("缓存失效后应重新加载同一脚本的资源", async () => {
    render(<ResourcePane uuid="u1" />);
    await screen.findByText("jquery.min.js");
    getScriptResources.mockResolvedValue({});

    invalidateResourcePane("u1");

    expect(await screen.findByText(t("no_data"))).toBeInTheDocument();
    expect(getScriptResources).toHaveBeenCalledTimes(2);
  });

  it("预加载切换脚本不应在渲染阶段更新订阅", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    function Shell({ uuid }: { uuid: string }) {
      usePreloadResourcePane(uuid);
      return <ResourcePane uuid={uuid} />;
    }

    const view = render(<Shell uuid="u1" />);
    await screen.findByText("jquery.min.js");
    view.rerender(<Shell uuid="u2" />);
    await waitFor(() => expect(getScriptResources).toHaveBeenCalledTimes(2));

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("预加载失败应展示错误而不是产生未处理拒绝", async () => {
    const toastError = vi.spyOn(toast, "error");
    fetchScript.mockRejectedValue(new Error("boom"));

    renderHook(() => usePreloadResourcePane("u1"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining("boom")));
  });

  it("未保存脚本不存在时不应读取资源或展示错误", async () => {
    const toastError = vi.spyOn(toast, "error");
    fetchScript.mockResolvedValue(null);

    renderHook(() => usePreloadResourcePane("new-script"));

    await waitFor(() => expect(fetchScript).toHaveBeenCalledWith("new-script"));
    expect(getScriptResources).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("预加载取消不应展示错误", async () => {
    let resolveFirst!: (resources: ReturnType<typeof sampleResources>) => void;
    getScriptResources
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(sampleResources());
    const toastError = vi.spyOn(toast, "error");

    const { rerender } = renderHook(({ uuid }) => usePreloadResourcePane(uuid), {
      initialProps: { uuid: "u1" },
    });
    await waitFor(() => expect(getScriptResources).toHaveBeenCalledTimes(1));
    rerender({ uuid: "u2" });
    await waitFor(() => expect(getScriptResources).toHaveBeenCalledTimes(2));
    await act(async () => resolveFirst(sampleResources()));

    expect(toastError).not.toHaveBeenCalled();
  });

  it("预加载器卸载后应清除同一脚本的缓存", async () => {
    const preloader = renderHook(() => usePreloadResourcePane("u1"));
    await waitFor(() => expect(getScriptResources).toHaveBeenCalledTimes(1));
    preloader.unmount();
    getScriptResources.mockResolvedValue({});

    render(<ResourcePane uuid="u1" />);

    expect(await screen.findByText(t("no_data"))).toBeInTheDocument();
    expect(getScriptResources).toHaveBeenCalledTimes(2);
  });
});
