import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { useHoverMenu } from "./use-hover-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";
import { Button } from "./button";

afterEach(cleanup);

// 测试用组件：使用封装的 Button
function HoverMenuWithButton({ onSelect }: { onSelect: (key: string) => void }) {
  const { close, rootProps, hoverProps, contentProps } = useHoverMenu(100);

  return (
    <DropdownMenu {...rootProps}>
      <DropdownMenuTrigger asChild>
        <Button data-testid="trigger" {...hoverProps}>
          新建脚本
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
          普通脚本
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="item-bg"
          onClick={() => {
            close();
            onSelect("background");
          }}
        >
          后台脚本
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
          新建脚本
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
          普通脚本
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="item-bg"
          onClick={() => {
            close();
            onSelect("background");
          }}
        >
          后台脚本
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
      vi.useRealTimers();
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
      render(<Button ref={ref}>测试</Button>);
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });
});
