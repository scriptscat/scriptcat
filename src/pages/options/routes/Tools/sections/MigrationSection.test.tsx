import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

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
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(1));
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]); // 气泡内确认按钮
    await waitFor(() => expect(migrate).toHaveBeenCalled());
  });
});
