import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { ChangeEvent, ReactNode } from "react";

const { create, backupToCloud } = vi.hoisted(() => ({
  create: vi.fn(),
  backupToCloud: vi.fn(() => Promise.resolve()),
}));
vi.mock("@Packages/filesystem/factory", () => ({
  default: {
    create,
    params: () => ({
      webdav: { url: { title: "url" } },
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
vi.mock("@App/pages/store/features/script", () => ({ synchronizeClient: { backupToCloud } }));

const { openImport } = vi.hoisted(() => ({ openImport: vi.fn(() => Promise.resolve()) }));
vi.mock("../openImportWindow", () => ({ openImportWindow: openImport }));

const { get, set } = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@App/pages/store/global", () => ({ systemConfig: { get, set }, subscribeMessage: () => () => {} }));

vi.mock("../../../components/FileSystemParams", async () => {
  const React = await import("react");
  return {
    default: function MockFileSystemParams({
      children,
      fileSystemParams,
      onChangeFileSystemType,
      onChangeFileSystemParams,
    }: {
      children?: ReactNode;
      fileSystemParams: Record<string, any>;
      onChangeFileSystemType: (type: "googledrive") => void;
      onChangeFileSystemParams: (params: Record<string, any>) => void;
    }) {
      return React.createElement(
        "div",
        null,
        React.createElement(
          "button",
          { type: "button", "data-testid": "filesystem_type", onClick: () => onChangeFileSystemType("googledrive") },
          "Google Drive"
        ),
        React.createElement("input", {
          "aria-label": "url",
          value: fileSystemParams.url ?? "",
          onChange: (e: ChangeEvent<HTMLInputElement>) => onChangeFileSystemParams({ url: e.target.value }),
        }),
        children
      );
    },
  };
});

import { CloudBackupSection } from "./CloudBackupSection";

function mockBackup(over: Record<string, unknown> = {}) {
  get.mockImplementation((key: string) => {
    if (key === "backup")
      return Promise.resolve({ filesystem: "webdav", params: { webdav: { url: "https://dav" } }, ...over });
    return Promise.resolve("");
  });
}

afterEach(() => {
  cleanup();
  get.mockReset();
  set.mockReset();
  create.mockReset();
  backupToCloud.mockReset();
  backupToCloud.mockResolvedValue(undefined);
  openImport.mockClear();
});

// 构造 create → openDir → {list, open, delete} 文件系统链
function mockFs(items: { name: string; updatetime: number }[]) {
  const fileReader = { read: vi.fn(() => Promise.resolve(new Blob(["zip"]))) };
  const fsDir = {
    list: vi.fn(() => Promise.resolve(items)),
    open: vi.fn(() => Promise.resolve(fileReader)),
    delete: vi.fn(() => Promise.resolve()),
  };
  const fsRoot = { openDir: vi.fn(() => Promise.resolve(fsDir)) };
  create.mockResolvedValue(fsRoot);
  return { fsRoot, fsDir, fileReader };
}

async function openBackupList() {
  const btn = await screen.findByTestId("tools_backup_list");
  fireEvent.click(btn);
}

describe("云端备份分区", () => {
  it("切换备份目标应立即保存配置但不执行备份", async () => {
    mockBackup({ params: { webdav: { url: "https://dav" }, googledrive: {} } });
    render(<CloudBackupSection register={() => () => {}} />);
    const trigger = await screen.findByTestId("filesystem_type");

    fireEvent.click(trigger);

    await waitFor(() =>
      expect(set).toHaveBeenCalledWith("backup", expect.objectContaining({ filesystem: "googledrive" }))
    );
    expect(backupToCloud).not.toHaveBeenCalled();
  });

  it("修改当前备份目标参数应立即保存配置但不执行备份", async () => {
    mockBackup();
    render(<CloudBackupSection register={() => () => {}} />);
    const urlInput = await screen.findByLabelText("url");

    fireEvent.change(urlInput, { target: { value: "https://dav-new" } });

    await waitFor(() =>
      expect(set).toHaveBeenCalledWith(
        "backup",
        expect.objectContaining({ params: expect.objectContaining({ webdav: { url: "https://dav-new" } }) })
      )
    );
    expect(backupToCloud).not.toHaveBeenCalled();
  });

  it("点击备份写入配置并上传云端", async () => {
    mockBackup();
    render(<CloudBackupSection register={() => () => {}} />);
    const btn = await screen.findByTestId("tools_backup");
    await act(async () => fireEvent.click(btn));
    expect(set).toHaveBeenCalledWith("backup", expect.objectContaining({ filesystem: "webdav" }));
    expect(backupToCloud).toHaveBeenCalledWith("webdav", { url: "https://dav" });
  });

  it("点击备份列表拉取 zip 文件并展示", async () => {
    const list = vi.fn(() =>
      Promise.resolve([
        { name: "a.zip", updatetime: 2000 },
        { name: "notes.txt", updatetime: 3000 },
        { name: "b.zip", updatetime: 1000 },
      ])
    );
    const fs2 = { list };
    const fs1 = { openDir: vi.fn(() => Promise.resolve(fs2)) };
    create.mockResolvedValue(fs1);
    mockBackup();
    render(<CloudBackupSection register={() => () => {}} />);
    const btn = await screen.findByTestId("tools_backup_list");
    await act(async () => fireEvent.click(btn));
    expect(create).toHaveBeenCalledWith("webdav", { url: "https://dav" });
    expect(fs1.openDir).toHaveBeenCalledWith("ScriptCat");
    // 只展示 .zip，过滤掉 txt
    expect(await screen.findByText("a.zip")).toBeInTheDocument();
    expect(screen.getByText("b.zip")).toBeInTheDocument();
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  });

  it("点击恢复从云端读取文件并打开导入窗口", async () => {
    const { fsDir, fileReader } = mockFs([{ name: "a.zip", updatetime: 2000 }]);
    mockBackup();
    render(<CloudBackupSection register={() => () => {}} />);
    await openBackupList();
    const restore = await screen.findByTestId("tools_restore");
    await act(async () => fireEvent.click(restore));
    expect(fsDir.open).toHaveBeenCalledWith({ name: "a.zip", updatetime: 2000 });
    expect(fileReader.read).toHaveBeenCalledWith("blob");
    expect(openImport).toHaveBeenCalledWith("a.zip", expect.any(Blob));
  });

  it("确认删除后从云端删除文件并移出列表", async () => {
    const { fsDir } = mockFs([{ name: "a.zip", updatetime: 2000 }]);
    mockBackup();
    render(<CloudBackupSection register={() => () => {}} />);
    await openBackupList();
    fireEvent.click(await screen.findByTestId("tools_delete"));
    await waitFor(() => expect(document.querySelectorAll("button").length).toBeGreaterThan(2));
    const buttons = document.querySelectorAll("button");
    await act(async () => fireEvent.click(buttons[buttons.length - 1])); // 气泡确认
    expect(fsDir.delete).toHaveBeenCalledWith("a.zip");
    expect(screen.queryByText("a.zip")).not.toBeInTheDocument();
  });
});
