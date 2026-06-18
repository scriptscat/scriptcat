// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage } from "@App/locales/locales";
import { CreateScriptMenu } from "./CreateScriptMenu";
import * as filePicker from "./filePicker";

vi.mock("./filePicker", () => ({ pickScriptFiles: vi.fn(async () => []), pickSkillZip: vi.fn(async () => []) }));
vi.mock("./importHandler", () => ({ handleImportFiles: vi.fn(), handleImportUrls: vi.fn() }));

afterEach(cleanup);
beforeEach(() => {
  initLanguage("zh-CN");
  vi.clearAllMocks();
});

function renderMenu(variant: "default" | "icon" = "default") {
  return render(
    <MemoryRouter>
      <CreateScriptMenu variant={variant} />
    </MemoryRouter>
  );
}

describe("CreateScriptMenu 下拉菜单", () => {
  it("hover trigger 后菜单展开,包含三个导入项", async () => {
    const { getByRole } = renderMenu();
    const trigger = getByRole("button");

    await act(async () => {
      fireEvent.mouseEnter(trigger);
    });

    expect(screen.getByText("导入本地脚本")).toBeInTheDocument();
    expect(screen.getByText("链接导入")).toBeInTheDocument();
    expect(screen.getByText("导入 Skill")).toBeInTheDocument();
  });

  it("点击「导入本地脚本」调用 pickScriptFiles", async () => {
    const { getByRole } = renderMenu();
    const trigger = getByRole("button");

    await act(async () => {
      fireEvent.mouseEnter(trigger);
    });

    const importLocalItem = screen.getByText("导入本地脚本");
    await act(async () => {
      fireEvent.click(importLocalItem);
    });

    expect(filePicker.pickScriptFiles).toHaveBeenCalledTimes(1);
  });

  it("点击「链接导入」打开 LinkImportDialog", async () => {
    const { getByRole } = renderMenu();
    const trigger = getByRole("button");

    await act(async () => {
      fireEvent.mouseEnter(trigger);
    });

    const linkImportItem = screen.getByText("链接导入");
    await act(async () => {
      fireEvent.click(linkImportItem);
    });

    // Dialog 应出现
    expect(screen.getByTestId("link-import-textarea")).toBeInTheDocument();
  });
});
