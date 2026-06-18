// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { Pencil } from "lucide-react";
import { AgentCardMenu } from "./AgentCardMenu";

afterEach(() => cleanup());

describe("AgentCardMenu 卡片菜单", () => {
  it("点击菜单项触发 onSelect", () => {
    const onSelect = vi.fn();
    render(<AgentCardMenu items={[{ key: "edit", label: "编辑", icon: Pencil, onSelect }]} />);
    // Radix 触发器在 pointerdown(左键) 时展开菜单——真实点击即包含此事件
    fireEvent.pointerDown(screen.getByTestId("card-menu"), { button: 0 });
    fireEvent.click(screen.getByTestId("card-menu-edit"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
