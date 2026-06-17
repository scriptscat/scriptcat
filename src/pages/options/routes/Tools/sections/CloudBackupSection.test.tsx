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
vi.mock("../openImportWindow", () => ({ openImportWindow: vi.fn(() => Promise.resolve()) }));

const { get, set } = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@App/pages/store/global", () => ({ systemConfig: { get, set }, subscribeMessage: () => () => {} }));

import { CloudBackupSection } from "./CloudBackupSection";

function mockBackup(over: Record<string, unknown> = {}) {
  get.mockImplementation((key: string) => {
    if (key === "backup") return Promise.resolve({ filesystem: "webdav", params: { webdav: { url: "https://dav" } }, ...over });
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
});

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
});
