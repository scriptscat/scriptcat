import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";

const { migrateToChromeStorage } = vi.hoisted(() => ({ migrateToChromeStorage: vi.fn() }));
vi.mock("@App/app/service/service_worker/client", () => ({
  SystemClient: class {
    migrateToChromeStorage = migrateToChromeStorage;
  },
}));
vi.mock("@App/pages/store/global", () => ({ message: {} }));

const { notifyError } = vi.hoisted(() => ({ notifyError: vi.fn() }));
vi.mock("@App/pages/components/ui/toast", () => ({ notify: { error: notifyError } }));

import { MigrationSection } from "./MigrationSection";

afterEach(() => {
  cleanup();
  migrateToChromeStorage.mockReset();
  notifyError.mockReset();
});

async function confirmMigration() {
  render(<MigrationSection register={() => () => {}} />);
  fireEvent.click(screen.getByTestId("retry_migration"));
  const confirm = await screen.findByTestId("popconfirm-confirm");
  await act(async () => fireEvent.click(confirm));
}

describe("数据迁移分区", () => {
  // 页面里的 Dexie 没有声明表结构，迁移只能交给 Service Worker 执行
  it("确认后请求 Service Worker 执行存储迁移", async () => {
    migrateToChromeStorage.mockResolvedValue(undefined);

    await confirmMigration();

    expect(migrateToChromeStorage).toHaveBeenCalledTimes(1);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("迁移失败时提示错误", async () => {
    migrateToChromeStorage.mockRejectedValue(new Error("boom"));

    await confirmMigration();

    expect(notifyError).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });
});
