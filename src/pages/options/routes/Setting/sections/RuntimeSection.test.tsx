import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const { create } = vi.hoisted(() => ({
  create: vi.fn(() =>
    Promise.resolve({
      openDir: vi.fn(() => Promise.resolve({ getDirUrl: vi.fn(() => Promise.resolve("https://dir")) })),
    })
  ),
}));
vi.mock("@Packages/filesystem/factory", () => ({
  default: {
    create,
    params: () => ({
      webdav: {
        authType: { title: "auth_type", type: "select", options: ["password", "digest", "none", "token"] },
        url: { title: "url" },
        username: { title: "username", visibilityFor: ["password", "digest"] },
        password: { title: "password", type: "password", visibilityFor: ["password", "digest"] },
        accessToken: { title: "access_token_bearer", visibilityFor: ["token"] },
      },
      "baidu-netdsik": {},
      onedrive: {},
      googledrive: {},
      dropbox: {},
      s3: {},
    }),
  },
}));
vi.mock("@Packages/filesystem/auth", () => ({
  netDiskTypeMap: { "baidu-netdsik": "baidu", onedrive: "onedrive", googledrive: "googledrive", dropbox: "dropbox" },
  HasNetDiskToken: vi.fn(() => Promise.resolve(false)),
  ClearNetDiskToken: vi.fn(() => Promise.resolve()),
}));

const { get, set } = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@App/pages/store/global", () => ({
  systemConfig: { get, set },
  subscribeMessage: () => () => {},
}));

// 后台权限检测在挂载时调用，固定返回 false 以免干扰存储配置测试
vi.mock("@App/pkg/utils/utils", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, isPermissionOk: vi.fn(() => Promise.resolve(false)) };
});

import { RuntimeSection } from "./RuntimeSection";

function mockStorage(over: Record<string, unknown> = {}) {
  get.mockImplementation((key: string) => {
    if (key === "cat_file_storage")
      return Promise.resolve({ status: "unset", filesystem: "webdav", params: {}, ...over });
    return Promise.resolve("");
  });
}

afterEach(() => {
  cleanup();
  get.mockReset();
  set.mockReset();
  create.mockReset();
  create.mockResolvedValue({
    openDir: vi.fn(() => Promise.resolve({ getDirUrl: vi.fn(() => Promise.resolve("https://dir")) })),
  });
});

describe("运行时分区-存储配置", () => {
  it("保存存储配置时校验账号成功后写入 success 状态", async () => {
    mockStorage({ status: "unset", filesystem: "webdav", params: { webdav: { url: "https://dav" } } });
    render(<RuntimeSection register={() => () => {}} />);
    const save = await screen.findByLabelText("cat_storage_save");
    fireEvent.click(save);
    await waitFor(() => expect(create).toHaveBeenCalledWith("webdav", { url: "https://dav" }));
    await waitFor(() =>
      expect(set).toHaveBeenCalledWith(
        "cat_file_storage",
        expect.objectContaining({ status: "success", filesystem: "webdav" })
      )
    );
  });

  it("校验失败时不写入存储配置", async () => {
    create.mockRejectedValue(new Error("bad"));
    mockStorage({ status: "unset", params: { webdav: { url: "https://dav" } } });
    render(<RuntimeSection register={() => () => {}} />);
    const save = await screen.findByLabelText("cat_storage_save");
    fireEvent.click(save);
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(set).not.toHaveBeenCalled();
  });

  it("重置存储配置写入 unset 默认值", async () => {
    mockStorage({ status: "success", filesystem: "webdav", params: { webdav: { url: "https://dav" } } });
    render(<RuntimeSection register={() => () => {}} />);
    const reset = await screen.findByLabelText("cat_storage_reset");
    fireEvent.click(reset);
    await waitFor(() =>
      expect(set).toHaveBeenCalledWith("cat_file_storage", { status: "unset", filesystem: "webdav", params: {} })
    );
  });

  it("打开目录时校验账号并打开返回的目录地址", async () => {
    const getDirUrl = vi.fn(() => Promise.resolve("https://dir/scriptcat"));
    const openDir = vi.fn(() => Promise.resolve({ getDirUrl }));
    create.mockResolvedValue({ openDir });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    mockStorage({ status: "success", filesystem: "webdav", params: { webdav: { url: "https://dav" } } });
    render(<RuntimeSection register={() => () => {}} />);
    const open = await screen.findByLabelText("cat_storage_open");
    fireEvent.click(open);
    await waitFor(() => expect(create).toHaveBeenCalledWith("webdav", { url: "https://dav" }));
    await waitFor(() => expect(openDir).toHaveBeenCalledWith("ScriptCat/app"));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith("https://dir/scriptcat", "_blank"));
    openSpy.mockRestore();
  });
});
