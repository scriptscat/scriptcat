import { describe, it, expect, vi, beforeAll, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { CreateScriptMenu } from "./CreateScriptMenu";
import * as filePicker from "./filePicker";

vi.mock("./filePicker", () => ({ pickScriptFiles: vi.fn(async () => []), pickSkillZip: vi.fn(async () => []) }));
vi.mock("./importHandler", () => ({ handleImportFiles: vi.fn(), handleImportUrls: vi.fn() }));

afterEach(cleanup);
beforeAll(() => initTestLanguage("zh-CN"));
beforeEach(() => {
  vi.clearAllMocks();
  // 默认桌面：具备 hover 能力
  mockMatchMedia((query) => query === "(hover: hover)");
});

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{pathname + search}</div>;
}

function renderMenu(variant: "default" | "icon" = "default") {
  return render(
    <MemoryRouter>
      <CreateScriptMenu variant={variant} />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("CreateScriptMenu 下拉菜单", () => {
  it("hover trigger 后菜单展开,包含三个导入项", async () => {
    const { container } = renderMenu();
    const trigger = container.querySelector("button")!;

    await act(async () => {
      fireEvent.mouseEnter(trigger);
    });

    expect(screen.getByText("导入本地脚本")).toBeInTheDocument();
    expect(screen.getByText("链接导入")).toBeInTheDocument();
    expect(screen.getByText("导入 Skill")).toBeInTheDocument();
  });

  it("点击「导入本地脚本」调用 pickScriptFiles", async () => {
    const { container } = renderMenu();
    const trigger = container.querySelector("button")!;

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
    const { container } = renderMenu();
    const trigger = container.querySelector("button")!;

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

  describe("桌面按钮（variant=default）", () => {
    it("hover 展开后点击按钮应新建用户脚本，而不是把菜单点掉", async () => {
      const { container } = renderMenu();
      const trigger = container.querySelector("button")!;

      await act(async () => {
        fireEvent.mouseEnter(trigger);
      });
      expect(screen.getByText("导入本地脚本")).toBeInTheDocument();

      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0 });
        fireEvent.click(trigger);
      });

      expect(screen.getByTestId("location")).toHaveTextContent("/script/editor");
    });

    it("未 hover 时直接点击同样应新建用户脚本", async () => {
      const { container } = renderMenu();
      const trigger = container.querySelector("button")!;

      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0 });
        fireEvent.click(trigger);
      });

      expect(screen.getByTestId("location")).toHaveTextContent("/script/editor");
    });

    it("键盘 Enter 应新建用户脚本，ArrowDown 才展开菜单", async () => {
      const { container } = renderMenu();
      const trigger = container.querySelector("button")!;

      await act(async () => {
        fireEvent.keyDown(trigger, { key: "ArrowDown" });
      });
      expect(screen.getByText("导入本地脚本")).toBeInTheDocument();

      await act(async () => {
        fireEvent.keyDown(trigger, { key: "Enter" });
      });
      expect(screen.getByTestId("location")).toHaveTextContent("/script/editor");
    });
  });

  describe("触摸设备（无 hover 能力）", () => {
    beforeEach(() => {
      mockMatchMedia(false);
    });

    it("点击按钮应展开菜单，而不是直接进编辑器（否则菜单在触摸屏上够不着）", async () => {
      const { container } = renderMenu();
      const trigger = container.querySelector("button")!;

      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0 });
        fireEvent.click(trigger);
      });

      expect(screen.getByText("导入本地脚本")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/");
      expect(screen.getByTestId("location")).not.toHaveTextContent("/script/editor");
    });

    it("展开后按 Esc 应能关闭（不被 hover 菜单的 dismiss 拦截而卡住）", async () => {
      const { container } = renderMenu();
      const trigger = container.querySelector("button")!;

      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0 });
        fireEvent.click(trigger);
      });
      expect(screen.getByText("导入本地脚本")).toBeInTheDocument();

      await act(async () => {
        fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
      });
      expect(screen.queryByText("导入本地脚本")).toBeNull();
    });
  });

  describe("移动端图标菜单（variant=icon）", () => {
    it("应通过点击展开，而非 hover（移动端无 hover，hover 触发会导致菜单卡住）", async () => {
      const { container } = renderMenu("icon");
      const trigger = container.querySelector("button")!;

      // hover 不应展开（移动端不依赖 hover）
      await act(async () => {
        fireEvent.mouseEnter(trigger);
      });
      expect(screen.queryByText("导入本地脚本")).toBeNull();

      // 点击（pointerDown）才展开
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0 });
        fireEvent.click(trigger);
      });
      expect(screen.getByText("导入本地脚本")).toBeInTheDocument();
    });

    it("展开后按 Esc 应能关闭（不被 hover 菜单的 dismiss 拦截而卡住）", async () => {
      const { container } = renderMenu("icon");
      const trigger = container.querySelector("button")!;

      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0 });
        fireEvent.click(trigger);
      });
      expect(screen.getByText("导入本地脚本")).toBeInTheDocument();

      await act(async () => {
        fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
      });
      expect(screen.queryByText("导入本地脚本")).toBeNull();
    });
  });
});
