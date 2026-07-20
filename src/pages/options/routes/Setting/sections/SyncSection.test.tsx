import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { CloudSyncConfig } from "@App/pkg/config/config";

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

const { get, set, externalStore, updateCloudSyncSnapshot, resetCloudSyncStore } = vi.hoisted(() => {
  let snapshot: CloudSyncConfig | undefined;
  const listeners = new Set<() => void>();
  const get = vi.fn((key: string) => Promise.resolve(key === "cloud_sync" ? snapshot : ""));
  const set = vi.fn((key: string, value: CloudSyncConfig) => {
    if (key !== "cloud_sync") return;
    snapshot = value;
    listeners.forEach((listener) => listener());
  });
  const store = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    set: (value: CloudSyncConfig) => set("cloud_sync", value),
  };
  return {
    get,
    set,
    externalStore: vi.fn(() => store),
    updateCloudSyncSnapshot: (value: CloudSyncConfig) => {
      snapshot = value;
      listeners.forEach((listener) => listener());
    },
    resetCloudSyncStore: () => {
      snapshot = undefined;
      listeners.clear();
    },
  };
});
vi.mock("@App/pages/store/global", () => ({
  systemConfig: { get, set, externalStore },
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

function mockCloudSync(over: Partial<CloudSyncConfig> = {}) {
  updateCloudSyncSnapshot({
    enable: false,
    syncDelete: false,
    syncStatus: true,
    filesystem: "webdav",
    params: {},
    ...over,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
  notify.warning.mockClear();
});

afterEach(() => {
  cleanup();
  get.mockClear();
  set.mockClear();
  externalStore.mockClear();
  resetCloudSyncStore();
  create.mockReset();
  create.mockResolvedValue({});
  fetchCloudSyncState.mockReset();
  subscribeCloudSyncState.mockReset();
  requestCloudSyncOnce.mockReset();
});

describe("同步分区", () => {
  it("启用时切换同步删除会立即写入并保留启用状态", async () => {
    mockCloudSync({ enable: true, syncDelete: false });
    render(<SyncSection register={() => () => {}} />);
    fireEvent.click(await screen.findByTestId("cloud_sync_sync_delete"));
    expect(set).toHaveBeenCalledWith("cloud_sync", expect.objectContaining({ enable: true, syncDelete: true }));
    expect(notify.info).not.toHaveBeenCalledWith("settings:cloud_sync_connection_changed");
  });

  it("启用时切换同步状态会立即写入并保留启用状态", async () => {
    mockCloudSync({ enable: true, syncStatus: true });
    render(<SyncSection register={() => () => {}} />);
    fireEvent.click(await screen.findByTestId("cloud_sync_sync_status"));
    expect(set).toHaveBeenCalledWith("cloud_sync", expect.objectContaining({ enable: true, syncStatus: false }));
    expect(notify.info).not.toHaveBeenCalledWith("settings:cloud_sync_connection_changed");
  });

  it("启用时编辑 WebDAV 参数会在一次写入中保存新参数并暂停同步", async () => {
    mockCloudSync({ enable: true, params: { webdav: { url: "" } } });
    render(<SyncSection register={() => () => {}} />);
    fireEvent.change(await screen.findByLabelText("url"), { target: { value: "https://dav.example.com" } });
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      "cloud_sync",
      expect.objectContaining({
        enable: false,
        params: { webdav: { url: "https://dav.example.com" } },
      })
    );
    expect(notify.info).toHaveBeenCalledTimes(1);
    expect(notify.info).toHaveBeenCalledWith("settings:cloud_sync_connection_changed");
    expect(screen.getByTestId("cloud_sync_enable")).toHaveAttribute("data-state", "unchecked");
  });

  it("启用时切换文件系统会在一次写入中保存新类型并暂停同步", async () => {
    mockCloudSync({ enable: true });
    render(<SyncSection register={() => () => {}} />);
    fireEvent.click(await screen.findByTestId("filesystem_type"));
    fireEvent.click(await screen.findByText("Amazon S3"));
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("cloud_sync", expect.objectContaining({ enable: false, filesystem: "s3" }));
    expect(notify.info).toHaveBeenCalledTimes(1);
    expect(notify.info).toHaveBeenCalledWith("settings:cloud_sync_connection_changed");
  });

  it("暂停后继续编辑连接参数会正常自动保存且不重复提示", async () => {
    mockCloudSync({ enable: true, params: { webdav: { url: "" } } });
    render(<SyncSection register={() => () => {}} />);
    const url = await screen.findByLabelText("url");

    fireEvent.change(url, { target: { value: "https://d" } });
    fireEvent.change(url, { target: { value: "https://dav.example.com" } });

    expect(set).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenLastCalledWith(
      "cloud_sync",
      expect.objectContaining({
        enable: false,
        params: { webdav: { url: "https://dav.example.com" } },
      })
    );
    expect(notify.info).toHaveBeenCalledTimes(1);
    expect(notify.info).toHaveBeenCalledWith("settings:cloud_sync_connection_changed");
  });

  it("连接配置自动暂停后必须重新校验才能启用", async () => {
    const verification = deferred<object>();
    create.mockReturnValue(verification.promise);
    mockCloudSync({ enable: true, params: { webdav: { url: "https://old.example.com" } } });
    render(<SyncSection register={() => () => {}} />);

    fireEvent.change(await screen.findByLabelText("url"), { target: { value: "https://new.example.com" } });
    set.mockClear();
    fireEvent.click(screen.getByTestId("cloud_sync_enable"));

    expect(create).toHaveBeenCalledWith("webdav", { url: "https://new.example.com" });
    expect(set).not.toHaveBeenCalled();
    await act(async () => verification.resolve({}));
    expect(set).toHaveBeenCalledWith(
      "cloud_sync",
      expect.objectContaining({
        enable: true,
        params: { webdav: { url: "https://new.example.com" } },
      })
    );
  });

  it("开启同步时显示校验状态且校验成功后才保存启用", async () => {
    const verification = deferred<object>();
    create.mockReturnValue(verification.promise);
    mockCloudSync({ params: { webdav: { url: "https://dav" } } });
    render(<SyncSection register={() => () => {}} />);
    const enable = await screen.findByTestId("cloud_sync_enable");

    fireEvent.click(enable);

    expect(create).toHaveBeenCalledWith("webdav", { url: "https://dav" });
    expect(set).not.toHaveBeenCalled();
    expect(enable).toHaveAttribute("data-state", "unchecked");
    expect(enable).toBeDisabled();
    expect(enable).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("cloud_sync_verifying")).toHaveAttribute(
      "aria-label",
      "settings:cloud_sync_account_verification"
    );
    expect(screen.getByTestId("cloud_sync_now")).toBeDisabled();
    expect(screen.queryByTestId("cloud_sync_status")).toBeNull();

    await act(async () => verification.resolve({}));

    expect(set).toHaveBeenCalledWith("cloud_sync", expect.objectContaining({ enable: true }));
    expect(enable).toHaveAttribute("data-state", "checked");
    expect(enable).not.toBeDisabled();
    expect(screen.getByTestId("cloud_sync_now")).not.toBeDisabled();
    expect(screen.getByTestId("cloud_sync_status")).not.toBeNull();
    expect(notify.success).toHaveBeenCalledWith("save_success");
  });

  it("开启校验失败时提示准确错误并保持未启用", async () => {
    create.mockRejectedValue(new Error("bad credentials"));
    mockCloudSync({ params: { webdav: { url: "https://dav" } } });
    render(<SyncSection register={() => () => {}} />);
    const enable = await screen.findByTestId("cloud_sync_enable");

    await act(async () => fireEvent.click(enable));

    expect(set).not.toHaveBeenCalled();
    expect(enable).toHaveAttribute("data-state", "unchecked");
    expect(enable).not.toBeDisabled();
    expect(enable).toHaveAttribute("aria-busy", "false");
    expect(notify.error).toHaveBeenCalledWith("settings:cloud_sync_verification_failed: bad credentials");
  });

  it("关闭同步时直接保存未启用且不校验连接", async () => {
    mockCloudSync({ enable: true, params: { webdav: { url: "https://dav" } } });
    render(<SyncSection register={() => () => {}} />);

    fireEvent.click(await screen.findByTestId("cloud_sync_enable"));

    expect(set).toHaveBeenCalledWith("cloud_sync", expect.objectContaining({ enable: false }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByTestId("cloud_sync_now")).toBeDisabled();
  });

  it("校验中禁用启用控件并忽略重复触发", async () => {
    const verification = deferred<object>();
    create.mockReturnValue(verification.promise);
    mockCloudSync({ params: { webdav: { url: "https://dav" } } });
    render(<SyncSection register={() => () => {}} />);
    const enable = await screen.findByTestId("cloud_sync_enable");

    fireEvent.click(enable);
    fireEvent.click(enable);

    expect(enable).toBeDisabled();
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => verification.resolve({}));
  });

  it("校验期间配置变化后忽略旧校验结果", async () => {
    const verification = deferred<object>();
    create.mockReturnValue(verification.promise);
    mockCloudSync({ params: { webdav: { url: "https://old.example.com" } } });
    render(<SyncSection register={() => () => {}} />);

    fireEvent.click(await screen.findByTestId("cloud_sync_enable"));
    fireEvent.change(screen.getByLabelText("url"), { target: { value: "https://new.example.com" } });
    expect(screen.queryByTestId("cloud_sync_verifying")).toBeNull();

    await act(async () => verification.resolve({}));

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      "cloud_sync",
      expect.objectContaining({ enable: false, params: { webdav: { url: "https://new.example.com" } } })
    );
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("外部配置变化应更新启用状态并淘汰进行中的校验", async () => {
    const verification = deferred<object>();
    create.mockReturnValue(verification.promise);
    mockCloudSync({ params: { webdav: { url: "https://dav" } } });
    render(<SyncSection register={() => () => {}} />);
    const enable = await screen.findByTestId("cloud_sync_enable");
    fireEvent.click(enable);

    act(() =>
      updateCloudSyncSnapshot({
        enable: true,
        syncDelete: false,
        syncStatus: true,
        filesystem: "webdav",
        params: { webdav: { url: "https://external.example.com" } },
      })
    );

    expect(enable).toHaveAttribute("data-state", "checked");
    expect(screen.queryByTestId("cloud_sync_verifying")).toBeNull();
    expect(screen.getByTestId("cloud_sync_now")).not.toBeDisabled();

    await act(async () => verification.reject(new Error("stale credentials")));
    expect(set).not.toHaveBeenCalled();
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("组件卸载后忽略未完成校验结果", async () => {
    const verification = deferred<object>();
    create.mockReturnValue(verification.promise);
    mockCloudSync({ params: { webdav: { url: "https://dav" } } });
    const { unmount } = render(<SyncSection register={() => () => {}} />);
    fireEvent.click(await screen.findByTestId("cloud_sync_enable"));

    unmount();
    await act(async () => verification.resolve({}));

    expect(set).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("不再显示保存按钮", async () => {
    mockCloudSync();
    render(<SyncSection register={() => () => {}} />);
    await screen.findByTestId("cloud_sync_enable");
    expect(screen.queryByTestId("cloud_sync_save")).toBeNull();
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
    await screen.findByTestId("cloud_sync_enable");
    expect(screen.queryByTestId("cloud_sync_status")).toBeNull();
  });

  it("仅有覆盖无冲突时状态条为同步正常（覆盖降级为信息级）并可查看日志", async () => {
    mockCloudSync({ enable: true, params: { webdav: { url: "https://dav" } } });
    mockState({ lastSyncAt: 1, counts: { total: 3, overwrite: 3, conflict: 0, failed: 0 } });
    render(<SyncSection register={() => () => {}} />);
    const strip = await screen.findByTestId("cloud_sync_status");
    expect(strip.getAttribute("data-variant")).toBe("idle");
    expect(screen.getByTestId("cloud_sync_view_logs")).not.toBeNull();
    expect(strip.textContent).toContain("settings:sync_state_overwrite_info");
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
