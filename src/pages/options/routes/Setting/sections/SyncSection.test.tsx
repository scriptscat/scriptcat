import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const { create } = vi.hoisted(() => ({ create: vi.fn(() => Promise.resolve({})) }));
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

import { SyncSection } from "./SyncSection";

function mockCloudSync(over: Record<string, unknown> = {}) {
  get.mockImplementation((key: string) => {
    if (key === "cloud_sync")
      return Promise.resolve({
        enable: false,
        syncDelete: false,
        syncStatus: true,
        filesystem: "webdav",
        params: {},
        ...over,
      });
    return Promise.resolve("");
  });
}

afterEach(() => {
  cleanup();
  get.mockReset();
  set.mockReset();
  create.mockReset();
  create.mockResolvedValue({});
});

describe("同步分区", () => {
  it("未启用同步时保存直接写入配置且不做账号校验", async () => {
    mockCloudSync({ enable: false });
    render(<SyncSection register={() => () => {}} />);
    const save = await screen.findByLabelText("cloud_sync_save");
    fireEvent.click(save);
    await waitFor(() => expect(set).toHaveBeenCalledWith("cloud_sync", expect.objectContaining({ enable: false })));
    expect(create).not.toHaveBeenCalled();
  });

  it("启用同步时保存先校验账号再写入配置", async () => {
    mockCloudSync({ enable: true, filesystem: "webdav", params: { webdav: { url: "https://dav" } } });
    render(<SyncSection register={() => () => {}} />);
    const save = await screen.findByLabelText("cloud_sync_save");
    fireEvent.click(save);
    await waitFor(() => expect(create).toHaveBeenCalledWith("webdav", { url: "https://dav" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("cloud_sync", expect.objectContaining({ enable: true })));
  });

  it("校验失败时不写入配置", async () => {
    create.mockRejectedValue(new Error("bad credentials"));
    mockCloudSync({ enable: true, params: { webdav: { url: "https://dav" } } });
    render(<SyncSection register={() => () => {}} />);
    const save = await screen.findByLabelText("cloud_sync_save");
    fireEvent.click(save);
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(set).not.toHaveBeenCalled();
  });

  it("切换同步删除复选框后保存写入新值", async () => {
    mockCloudSync({ enable: false, syncDelete: false });
    render(<SyncSection register={() => () => {}} />);
    const cb = await screen.findByLabelText("cloud_sync_sync_delete");
    fireEvent.click(cb);
    fireEvent.click(screen.getByLabelText("cloud_sync_save"));
    await waitFor(() => expect(set).toHaveBeenCalledWith("cloud_sync", expect.objectContaining({ syncDelete: true })));
  });
});
