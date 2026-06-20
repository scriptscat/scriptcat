// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

// 仅测试组件的渲染/可见性/回调逻辑，后端 schema 用受控 mock，避免拉起真实文件系统栈
vi.mock("@Packages/filesystem/factory", () => ({
  default: {
    params: () => ({
      webdav: {
        authType: {
          title: "auth_type",
          type: "select",
          options: ["password", "digest", "none", "token"],
          minWidth: "140px",
        },
        url: { title: "url" },
        username: { title: "username", visibilityFor: ["password", "digest"] },
        password: { title: "password", type: "password", visibilityFor: ["password", "digest"] },
        accessToken: { title: "access_token_bearer", visibilityFor: ["token"] },
      },
      "baidu-netdsik": {},
      onedrive: {},
      googledrive: {},
      dropbox: {},
      s3: {
        bucket: { title: "s3_bucket_name" },
        region: { title: "s3_region" },
        accessKeyId: { title: "s3_access_key_id" },
        secretAccessKey: { title: "s3_secret_access_key", type: "password" },
        endpoint: { title: "s3_custom_endpoint" },
      },
    }),
  },
}));

const { hasNetDiskToken, clearNetDiskToken } = vi.hoisted(() => ({
  hasNetDiskToken: vi.fn(() => Promise.resolve(false)),
  clearNetDiskToken: vi.fn(() => Promise.resolve()),
}));
vi.mock("@Packages/filesystem/auth", () => ({
  netDiskTypeMap: { "baidu-netdsik": "baidu", onedrive: "onedrive", googledrive: "googledrive", dropbox: "dropbox" },
  HasNetDiskToken: hasNetDiskToken,
  ClearNetDiskToken: clearNetDiskToken,
}));

import FileSystemParams from "./FileSystemParams";

afterEach(() => {
  cleanup();
  hasNetDiskToken.mockReset();
  hasNetDiskToken.mockResolvedValue(false);
  clearNetDiskToken.mockReset();
  clearNetDiskToken.mockResolvedValue(undefined);
});

function setup(overrides: Record<string, unknown> = {}) {
  const onChangeFileSystemType = vi.fn();
  const onChangeFileSystemParams = vi.fn();
  render(
    <FileSystemParams
      headerContent={<span>{"header"}</span>}
      fileSystemType="webdav"
      fileSystemParams={{}}
      onChangeFileSystemType={onChangeFileSystemType}
      onChangeFileSystemParams={onChangeFileSystemParams}
      {...(overrides as any)}
    />
  );
  return { onChangeFileSystemType, onChangeFileSystemParams };
}

describe("文件系统参数表单", () => {
  it("WebDAV 默认认证下显示 URL/用户名/密码，隐藏 AccessToken", () => {
    setup({ fileSystemType: "webdav", fileSystemParams: {} });
    expect(screen.getByLabelText("url")).toBeInTheDocument();
    expect(screen.getByLabelText("username")).toBeInTheDocument();
    expect(screen.getByLabelText("password")).toBeInTheDocument();
    expect(screen.queryByLabelText("access_token_bearer")).not.toBeInTheDocument();
  });

  it("认证类型为 token 时显示 AccessToken，隐藏用户名/密码", () => {
    setup({ fileSystemType: "webdav", fileSystemParams: { authType: "token" } });
    expect(screen.getByLabelText("access_token_bearer")).toBeInTheDocument();
    expect(screen.queryByLabelText("username")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("password")).not.toBeInTheDocument();
  });

  it("编辑 URL 输入框时以合并后的参数回调", () => {
    const { onChangeFileSystemParams } = setup({ fileSystemType: "webdav", fileSystemParams: { url: "" } });
    fireEvent.change(screen.getByLabelText("url"), { target: { value: "https://dav.example.com" } });
    expect(onChangeFileSystemParams).toHaveBeenCalledWith({ url: "https://dav.example.com" });
  });

  it("S3 后端渲染其专属字段", () => {
    setup({ fileSystemType: "s3", fileSystemParams: {} });
    expect(screen.getByLabelText("s3_bucket_name")).toBeInTheDocument();
    expect(screen.getByLabelText("s3_secret_access_key")).toBeInTheDocument();
    expect(screen.queryByLabelText("url")).not.toBeInTheDocument();
  });

  it("网盘后端已绑定 token 时显示解绑按钮，确认后清除 token", async () => {
    hasNetDiskToken.mockResolvedValue(true);
    setup({ fileSystemType: "baidu-netdsik", fileSystemParams: {} });
    const unbind = await screen.findByTestId("netdisk_unbind");
    fireEvent.click(unbind);
    // 弹出确认气泡后点击确认按钮（气泡内最后一个按钮）
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(1));
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(clearNetDiskToken).toHaveBeenCalledWith("baidu"));
  });

  it("非网盘后端不显示解绑按钮", async () => {
    hasNetDiskToken.mockResolvedValue(true);
    setup({ fileSystemType: "webdav", fileSystemParams: {} });
    await waitFor(() => expect(screen.getByLabelText("url")).toBeInTheDocument());
    expect(screen.queryByTestId("netdisk_unbind")).not.toBeInTheDocument();
  });
});
