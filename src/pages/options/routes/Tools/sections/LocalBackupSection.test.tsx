import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { exportFn } = vi.hoisted(() => ({
  exportFn: vi.fn(() =>
    Promise.resolve({ url: "blob:scriptcat-backup", filename: "scriptcat-backup-2026-07-05T12-00-00.zip" })
  ),
}));
vi.mock("@App/pages/store/features/script", () => ({ synchronizeClient: { export: exportFn } }));

const { openImport } = vi.hoisted(() => ({ openImport: vi.fn(() => Promise.resolve()) }));
vi.mock("../openImportWindow", () => ({ openImportWindow: openImport }));

import { LocalBackupSection } from "./LocalBackupSection";

beforeAll(() => initTestLanguage("en-US"));

afterEach(() => {
  cleanup();
  exportFn.mockClear();
  openImport.mockClear();
});

describe("本地备份分区", () => {
  it("点击导出触发备份导出", async () => {
    render(<LocalBackupSection register={() => () => {}} />);
    await act(async () => fireEvent.click(screen.getByTestId("tools_export")));
    expect(exportFn).toHaveBeenCalled();
  });

  it("导出后显示不依赖下载 API 的手动下载链接", async () => {
    render(<LocalBackupSection register={() => () => {}} />);

    await act(async () => fireEvent.click(screen.getByTestId("tools_export")));

    const link = screen.getByText("Download manually if the download doesn't start");
    expect(link).toHaveAttribute("href", "blob:scriptcat-backup");
    expect(link).toHaveAttribute("download", "scriptcat-backup-2026-07-05T12-00-00.zip");
  });

  it("选择文件后通过导入窗口处理", async () => {
    render(<LocalBackupSection register={() => () => {}} />);
    fireEvent.click(screen.getByTestId("tools_import")); // 绑定 onchange
    const input = screen.getByTestId("tools_import_file") as HTMLInputElement;
    const file = new File(["x"], "backup.zip", { type: "application/zip" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => fireEvent.change(input));
    expect(openImport).toHaveBeenCalledWith("backup.zip", file);
  });
});
