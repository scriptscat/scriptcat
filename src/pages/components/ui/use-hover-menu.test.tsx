import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { useHoverMenu } from "./use-hover-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";
import { Button } from "./button";

afterEach(cleanup);
afterEach(() => vi.useRealTimers());

// 直接驱动 rootProps.onOpenChange，验证关闭信号被正确处理（Radix 在外部点击/程序化关闭时调用 onOpenChange(false)）
function OpenChangeHarness() {
  const { isOpen, rootProps } = useHoverMenu(100);
  return (
    <div>
      <span data-testid="state">{isOpen ? "open" : "closed"}</span>
      <button type="button" data-testid="signal-open" onClick={() => rootProps.onOpenChange(true)}>
        {"open"}
      </button>
      <button type="button" data-testid="signal-close" onClick={() => rootProps.onOpenChange(false)}>
        {"close"}
      </button>
    </div>
  );
}

// 测试用组件：使用封装的 Button
function HoverMenuWithButton({ onSelect }: { onSelect: (key: string) => void }) {
  const { close, rootProps, hoverProps, contentProps } = useHoverMenu(100);

  return (
    <DropdownMenu {...rootProps}>
      <DropdownMenuTrigger asChild>
        <Button data-testid="trigger" {...hoverProps}>
          {"新建脚本"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent {...contentProps}>
        <DropdownMenuItem
          data-testid="item-normal"
          onClick={() => {
            close();
            onSelect("normal");
          }}
        >
          {"普通脚本"}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="item-bg"
          onClick={() => {
            close();
            onSelect("background");
          }}
        >
          {"后台脚本"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// 测试用组件：使用原生 button
function HoverMenuWithNativeButton({ onSelect }: { onSelect: (key: string) => void }) {
  const { close, rootProps, hoverProps, contentProps } = useHoverMenu(100);

  return (
    <DropdownMenu {...rootProps}>
      <DropdownMenuTrigger asChild>
        <button type="button" data-testid="trigger" {...hoverProps}>
          {"新建脚本"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent {...contentProps}>
        <DropdownMenuItem
          data-testid="item-normal"
          onClick={() => {
            close();
            onSelect("normal");
          }}
        >
          {"普通脚本"}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="item-bg"
          onClick={() => {
            close();
            onSelect("background");
          }}
        >
          {"后台脚本"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("useHoverMenu 与 DropdownMenu 集成测试", () => {
  describe("使用原生 button", () => {
    it("hover 触发应展示下拉菜单", async () => {
      const onSelect = vi.fn();
      const { getByTestId, queryByTestId } = render(<HoverMenuWithNativeButton onSelect={onSelect} />);

      const trigger = getByTestId("trigger");
      expect(queryByTestId("item-normal")).toBeNull();

      await act(async () => {
        fireEvent.mouseEnter(trigger);
      });

      expect(queryByTestId("item-normal")).not.toBeNull();
    });

    it("鼠标离开后菜单应关闭", async () => {
      vi.useFakeTimers();
      const onSelect = vi.fn();
      const { getByTestId, queryByTestId } = render(<HoverMenuWithNativeButton onSelect={onSelect} />);

      const trigger = getByTestId("trigger");

      await act(async () => {
        fireEvent.mouseEnter(trigger);
      });
      expect(queryByTestId("item-normal")).not.toBeNull();

      await act(async () => {
        fireEvent.mouseLeave(trigger);
      });
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(queryByTestId("item-normal")).toBeNull();
    });
  });

  describe("使用封装的 Button 组件（需要 forwardRef）", () => {
    it("hover 触发应展示下拉菜单", async () => {
      const onSelect = vi.fn();
      const { getByTestId, queryByTestId } = render(<HoverMenuWithButton onSelect={onSelect} />);

      const trigger = getByTestId("trigger");
      expect(queryByTestId("item-normal")).toBeNull();

      await act(async () => {
        fireEvent.mouseEnter(trigger);
      });

      expect(queryByTestId("item-normal")).not.toBeNull();
    });

    it("Button 组件应正确转发 ref", () => {
      // 验证 Button 的 forwardRef 工作正常，Radix Slot 不再报警告
      const ref = { current: null as HTMLButtonElement | null };
      render(<Button ref={ref}>{"测试"}</Button>);
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });

  describe("onOpenChange 关闭信号", () => {
    it("收到 onOpenChange(false) 时应关闭菜单（不能只处理 open=true）", () => {
      const { getByTestId } = render(<OpenChangeHarness />);
      expect(getByTestId("state").textContent).toBe("closed");

      fireEvent.click(getByTestId("signal-open"));
      expect(getByTestId("state").textContent).toBe("open");

      // Radix 在外部点击/程序化 dismiss 时会调用 onOpenChange(false)，必须据此关闭
      fireEvent.click(getByTestId("signal-close"));
      expect(getByTestId("state").textContent).toBe("closed");
    });
  });
});
