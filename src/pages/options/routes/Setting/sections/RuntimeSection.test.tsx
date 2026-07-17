import { beforeAll, describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

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

const { get, set, isPermissionOk, isFirefoxMock } = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  isPermissionOk: vi.fn((permission: string) => Promise.resolve(permission === "webRequestBlocking" ? null : false)),
  // 默认沿用 jsdom 下的真实判断（非 Firefox），仅在需要测试 Firefox 专属开关的用例中临时改为 true
  isFirefoxMock: vi.fn(() => false),
}));
vi.mock("@App/pages/store/global", () => ({
  systemConfig: { get, set },
  subscribeMessage: () => () => {},
}));

// 后台权限检测在挂载时调用，固定返回 false 以免干扰存储配置测试
vi.mock("@App/pkg/utils/utils", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, isPermissionOk, isFirefox: isFirefoxMock };
});

import { RuntimeSection } from "./RuntimeSection";

beforeAll(() => initTestLanguage("en-US"));

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
  isPermissionOk.mockReset();
  isPermissionOk.mockImplementation((permission: string) =>
    Promise.resolve(permission === "webRequestBlocking" ? null : false)
  );
  isFirefoxMock.mockReset();
  isFirefoxMock.mockReturnValue(false);
  create.mockReset();
  create.mockResolvedValue({
    openDir: vi.fn(() => Promise.resolve({ getDirUrl: vi.fn(() => Promise.resolve("https://dir")) })),
  });
});

describe("运行时分区-可选保活权限", () => {
  it("非 Firefox 浏览器显示 Chrome 保活开关而不依赖 webRequestBlocking", async () => {
    mockStorage();
    render(<RuntimeSection register={() => () => {}} />);
    await screen.findByTestId("cat_storage_save");
    expect(screen.getByText("Keep Background and Scheduled Scripts Alive")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("非 Firefox 浏览器切换保活开关时保存配置", async () => {
    mockStorage();
    render(<RuntimeSection register={() => () => {}} />);
    await screen.findByText("Keep Background and Scheduled Scripts Alive");

    fireEvent.click(screen.getAllByRole("switch")[1]);

    expect(set).toHaveBeenCalledWith("keep_ext_background_alive", true);
  });

  it("manifest 包含 webRequestBlocking 时显示开关并可请求权限", async () => {
    isPermissionOk.mockImplementation((permission: string) =>
      Promise.resolve(permission === "webRequestBlocking" ? false : false)
    );
    // isFirefox 判断结果在模块顶层被固化为常量，临时开启后需重置模块并重新导入才能生效
    isFirefoxMock.mockReturnValue(true);
    vi.resetModules();
    const { RuntimeSection: RuntimeSectionOnFirefox } = await import("./RuntimeSection.js");
    try {
      const request = vi.spyOn(chrome.permissions, "request");
      mockStorage();
      render(<RuntimeSectionOnFirefox register={() => () => {}} />);
      await screen.findByText("Keep Background and Scheduled Scripts Alive");
      const toggle = screen.getAllByRole("switch").at(-1);
      expect(toggle).toBeInTheDocument();

      fireEvent.click(toggle!);

      expect(request).toHaveBeenCalledWith({ permissions: ["webRequestBlocking"] }, expect.any(Function));
    } finally {
      isFirefoxMock.mockReturnValue(false);
      vi.resetModules();
    }
  });

  it("Firefox 关闭保活时关闭配置并移除可选权限", async () => {
    isPermissionOk.mockResolvedValue(true);
    isFirefoxMock.mockReturnValue(true);
    get.mockImplementation((key: string) => {
      if (key === "keep_ext_background_alive") return Promise.resolve(true);
      return Promise.resolve({ status: "unset", filesystem: "webdav", params: {} });
    });
    vi.resetModules();
    const { RuntimeSection: RuntimeSectionOnFirefox } = await import("./RuntimeSection.js");
    try {
      const remove = vi.spyOn(chrome.permissions, "remove");
      render(<RuntimeSectionOnFirefox register={() => () => {}} />);
      await screen.findByText("Keep Background and Scheduled Scripts Alive");
      fireEvent.click(screen.getAllByRole("switch").at(-1)!);
      expect(set).toHaveBeenCalledWith("keep_ext_background_alive", false);
      expect(remove).toHaveBeenCalledWith({ permissions: ["webRequestBlocking"] }, expect.any(Function));
    } finally {
      isFirefoxMock.mockReturnValue(false);
      vi.resetModules();
    }
  });
});

describe("运行时分区-存储配置", () => {
  it("保存存储配置时校验账号成功后写入 success 状态", async () => {
    mockStorage({ status: "unset", filesystem: "webdav", params: { webdav: { url: "https://dav" } } });
    render(<RuntimeSection register={() => () => {}} />);
    const save = await screen.findByTestId("cat_storage_save");
    await act(async () => fireEvent.click(save));
    expect(create).toHaveBeenCalledWith("webdav", { url: "https://dav" });
    expect(set).toHaveBeenCalledWith(
      "cat_file_storage",
      expect.objectContaining({ status: "success", filesystem: "webdav" })
    );
  });

  it("校验失败时不写入存储配置", async () => {
    create.mockRejectedValue(new Error("bad"));
    mockStorage({ status: "unset", params: { webdav: { url: "https://dav" } } });
    render(<RuntimeSection register={() => () => {}} />);
    const save = await screen.findByTestId("cat_storage_save");
    await act(async () => fireEvent.click(save));
    expect(create).toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("重置存储配置写入 unset 默认值", async () => {
    mockStorage({ status: "success", filesystem: "webdav", params: { webdav: { url: "https://dav" } } });
    render(<RuntimeSection register={() => () => {}} />);
    const reset = await screen.findByTestId("cat_storage_reset");
    await act(async () => fireEvent.click(reset));
    expect(set).toHaveBeenCalledWith("cat_file_storage", { status: "unset", filesystem: "webdav", params: {} });
  });

  it("打开目录时校验账号并打开返回的目录地址", async () => {
    const getDirUrl = vi.fn(() => Promise.resolve("https://dir/scriptcat"));
    const openDir = vi.fn(() => Promise.resolve({ getDirUrl }));
    create.mockResolvedValue({ openDir });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    mockStorage({ status: "success", filesystem: "webdav", params: { webdav: { url: "https://dav" } } });
    render(<RuntimeSection register={() => () => {}} />);
    const open = await screen.findByTestId("cat_storage_open");
    await act(async () => fireEvent.click(open));
    expect(create).toHaveBeenCalledWith("webdav", { url: "https://dav" });
    expect(openDir).toHaveBeenCalledWith("ScriptCat/app");
    expect(openSpy).toHaveBeenCalledWith("https://dir/scriptcat", "_blank");
    openSpy.mockRestore();
  });
});
