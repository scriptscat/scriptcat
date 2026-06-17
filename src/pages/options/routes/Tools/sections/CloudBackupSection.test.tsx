import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

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
  const btn = await screen.findByLabelText("tools_backup_list");
  fireEvent.click(btn);
}

describe("云端备份分区", () => {
  it("点击备份写入配置并上传云端", async () => {
    mockBackup();
    render(<CloudBackupSection register={() => () => {}} />);
    const btn = await screen.findByLabelText("tools_backup");
    fireEvent.click(btn);
    expect(set).toHaveBeenCalledWith("backup", expect.objectContaining({ filesystem: "webdav" }));
    await waitFor(() => expect(backupToCloud).toHaveBeenCalledWith("webdav", { url: "https://dav" }));
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
    const btn = await screen.findByLabelText("tools_backup_list");
    fireEvent.click(btn);
    await waitFor(() => expect(create).toHaveBeenCalledWith("webdav", { url: "https://dav" }));
    await waitFor(() => expect(fs1.openDir).toHaveBeenCalledWith("ScriptCat"));
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
    const restore = await screen.findByLabelText("tools_restore");
    fireEvent.click(restore);
    await waitFor(() => expect(fsDir.open).toHaveBeenCalledWith({ name: "a.zip", updatetime: 2000 }));
    await waitFor(() => expect(fileReader.read).toHaveBeenCalledWith("blob"));
    await waitFor(() => expect(openImport).toHaveBeenCalledWith("a.zip", expect.any(Blob)));
  });

  it("确认删除后从云端删除文件并移出列表", async () => {
    const { fsDir } = mockFs([{ name: "a.zip", updatetime: 2000 }]);
    mockBackup();
    render(<CloudBackupSection register={() => () => {}} />);
    await openBackupList();
    fireEvent.click(await screen.findByLabelText("tools_delete"));
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(2));
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]); // 气泡确认
    await waitFor(() => expect(fsDir.delete).toHaveBeenCalledWith("a.zip"));
    await waitFor(() => expect(screen.queryByText("a.zip")).not.toBeInTheDocument());
  });
});
