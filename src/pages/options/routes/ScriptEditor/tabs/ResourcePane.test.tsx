import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
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

import ResourcePane from "./ResourcePane";

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
afterEach(cleanup);

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
});
