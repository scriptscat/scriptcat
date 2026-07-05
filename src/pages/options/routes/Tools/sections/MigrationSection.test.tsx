import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";

const { migrate } = vi.hoisted(() => ({ migrate: vi.fn() }));
vi.mock("@App/app/migrate", () => ({ migrateToChromeStorage: migrate }));

import { MigrationSection } from "./MigrationSection";

afterEach(() => {
  cleanup();
  migrate.mockClear();
});

describe("数据迁移分区", () => {
  it("确认后触发存储迁移", async () => {
    render(<MigrationSection register={() => () => {}} />);
    fireEvent.click(screen.getByTestId("retry_migration"));
    const confirm = await screen.findByTestId("popconfirm-confirm");
    await act(async () => fireEvent.click(confirm));
    expect(migrate).toHaveBeenCalled();
  });
});
