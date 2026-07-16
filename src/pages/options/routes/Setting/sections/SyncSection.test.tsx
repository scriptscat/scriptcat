import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";

const { t } = vi.hoisted(() => ({
  t: vi.fn((key: string, opts?: Record<string, unknown>) =>
    opts?.failed === undefined ? key : `${key}:${String(opts.failed)}`
  ),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));

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

const { fetchCloudSyncState, subscribeCloudSyncState, requestCloudSyncOnce } = vi.hoisted(() => ({
  fetchCloudSyncState: vi.fn(),
  subscribeCloudSyncState: vi.fn(() => () => {}),
  requestCloudSyncOnce: vi.fn(() => Promise.resolve()),
}));
vi.mock("@App/pages/store/features/cloud_sync", () => ({
  fetchCloudSyncState,
  subscribeCloudSyncState,
  requestCloudSyncOnce,
}));

const { notify } = vi.hoisted(() => ({
  notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@App/pages/components/ui/toast", () => ({ notify }));

import { SyncSection } from "./SyncSection";

function mockState(over: Record<string, unknown> = {}) {
  fetchCloudSyncState.mockResolvedValue({
    syncing: false,
    lastSyncAt: 0,
    error: undefined,
    counts: { total: 0, overwrite: 0, conflict: 0, failed: 0 },
    ...over,
  });
}

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

beforeEach(() => {
  // 默认：状态读取返回空闲态，订阅返回空清理函数，避免未显式 mock 的用例在 effect 中崩溃
  mockState();
  subscribeCloudSyncState.mockReturnValue(() => {});
  requestCloudSyncOnce.mockResolvedValue(undefined);
  t.mockClear();
  notify.info.mockClear();
  notify.success.mockClear();
  notify.error.mockClear();
});

afterEach(() => {
  cleanup();
  get.mockReset();
  set.mockReset();
  create.mockReset();
  create.mockResolvedValue({});
  fetchCloudSyncState.mockReset();
  subscribeCloudSyncState.mockReset();
  requestCloudSyncOnce.mockReset();
});

describe("同步分区", () => {
  it("未启用同步时保存直接写入配置且不做账号校验", async () => {
    mockCloudSync({ enable: false });
    render(<SyncSection register={() => () => {}} />);
    const save = await screen.findByTestId("cloud_sync_save");
    await act(async () => fireEvent.click(save));
    expect(set).toHaveBeenCalledWith("cloud_sync", expect.objectContaining({ enable: false }));
    expect(create).not.toHaveBeenCalled();
  });

  it("启用同步时保存先校验账号再写入配置", async () => {
    mockCloudSync({ enable: true, filesystem: "webdav", params: { webdav: { url: "https://dav" } } });
    render(<SyncSection register={() => () => {}} />);
    const save = await screen.findByTestId("cloud_sync_save");
    await act(async () => fireEvent.click(save));
    expect(create).toHaveBeenCalledWith("webdav", { url: "https://dav" });
    expect(set).toHaveBeenCalledWith("cloud_sync", expect.objectContaining({ enable: true }));
  });

  it("校验失败时不写入配置", async () => {
    create.mockRejectedValue(new Error("bad credentials"));
    mockCloudSync({ enable: true, params: { webdav: { url: "https://dav" } } });
    render(<SyncSection register={() => () => {}} />);
    const save = await screen.findByTestId("cloud_sync_save");
    await act(async () => fireEvent.click(save));
    expect(create).toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("切换同步删除复选框后保存写入新值", async () => {
    mockCloudSync({ enable: false, syncDelete: false });
    render(<SyncSection register={() => () => {}} />);
    const cb = await screen.findByTestId("cloud_sync_sync_delete");
    fireEvent.click(cb);
    await act(async () => fireEvent.click(screen.getByTestId("cloud_sync_save")));
    expect(set).toHaveBeenCalledWith("cloud_sync", expect.objectContaining({ syncDelete: true }));
  });

  it("切换同步状态复选框后保存写入新值", async () => {
    mockCloudSync({ enable: false, syncStatus: true });
    render(<SyncSection register={() => () => {}} />);
    const cb = await screen.findByTestId("cloud_sync_sync_status");
    fireEvent.click(cb);
    await act(async () => fireEvent.click(screen.getByTestId("cloud_sync_save")));
    expect(set).toHaveBeenCalledWith("cloud_sync", expect.objectContaining({ syncStatus: false }));
  });

  it("启用同步且上次有覆盖/冲突时显示警示状态条与查看日志深链", async () => {
    mockCloudSync({ enable: true, params: { webdav: { url: "https://dav" } } });
    mockState({ lastSyncAt: 1, counts: { total: 3, overwrite: 2, conflict: 1, failed: 0 } });
    render(<SyncSection register={() => () => {}} />);
    const strip = await screen.findByTestId("cloud_sync_status");
    expect(strip.getAttribute("data-variant")).toBe("warning");
    const href = screen.getByTestId("cloud_sync_view_logs").getAttribute("href") || "";
    expect(decodeURIComponent(href)).toContain("synchronize");
    expect(decodeURIComponent(href)).not.toContain("overwrite");
  });

  it("上次有文件同步失败时显示失败数量", async () => {
    mockCloudSync({ enable: true, params: { webdav: { url: "https://dav" } } });
    mockState({ lastSyncAt: 1, counts: { total: 3, overwrite: 0, conflict: 0, failed: 2 } });
    render(<SyncSection register={() => () => {}} />);

    const strip = await screen.findByTestId("cloud_sync_status");
    expect(strip.getAttribute("data-variant")).toBe("error");
    expect(strip.textContent).toContain("settings:sync_state_failed_desc:2");
  });

  it("点击立即同步触发一次云同步", async () => {
    mockCloudSync({ enable: true, params: { webdav: { url: "https://dav" } } });
    mockState({ lastSyncAt: 1 });
    render(<SyncSection register={() => () => {}} />);
    const btn = await screen.findByTestId("cloud_sync_now");
    await act(async () => fireEvent.click(btn));
    expect(requestCloudSyncOnce).toHaveBeenCalled();
  });

  it("未启用同步时不显示状态条", async () => {
    mockCloudSync({ enable: false });
    mockState({});
    render(<SyncSection register={() => () => {}} />);
    await screen.findByTestId("cloud_sync_save");
    expect(screen.queryByTestId("cloud_sync_status")).toBeNull();
  });

  it("立即同步失败时弹出错误提示（不产生未捕获异常）", async () => {
    mockCloudSync({ enable: true, params: { webdav: { url: "https://dav" } } });
    mockState({ lastSyncAt: 1 });
    requestCloudSyncOnce.mockRejectedValue(new Error("verify failed"));
    render(<SyncSection register={() => () => {}} />);
    const btn = await screen.findByTestId("cloud_sync_now");
    await act(async () => fireEvent.click(btn));
    expect(notify.error).toHaveBeenCalled();
  });
});
