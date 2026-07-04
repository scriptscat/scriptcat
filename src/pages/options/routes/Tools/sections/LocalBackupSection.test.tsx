import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";

const { exportFn } = vi.hoisted(() => ({ exportFn: vi.fn(() => Promise.resolve()) }));
vi.mock("@App/pages/store/features/script", () => ({ synchronizeClient: { export: exportFn } }));

const { openImport } = vi.hoisted(() => ({ openImport: vi.fn(() => Promise.resolve()) }));
vi.mock("../openImportWindow", () => ({ openImportWindow: openImport }));

import { LocalBackupSection } from "./LocalBackupSection";

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
