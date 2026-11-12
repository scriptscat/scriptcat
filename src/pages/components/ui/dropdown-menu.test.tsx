import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

afterEach(cleanup);

const renderMenu = () =>
  render(
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger>{"trigger"}</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>{"item"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button">{"elsewhere"}</button>
    </>
  );

const open = () => {
  renderMenu();
  const trigger = screen.getByRole("button", { name: "trigger" });
  fireEvent.pointerDown(trigger, { button: 0 });
  return trigger;
};

describe("非模态 DropdownMenu", () => {
  // Firefox 在 pointerdown 打开菜单后，紧随其后的 mousedown 仍会把焦点移到触发按钮上；
  // 这一步若被当成「焦点移出菜单」，菜单会在打开的同一次点击里被关掉（#1839）
  it("焦点落到自己的触发按钮上时保持打开", () => {
    const trigger = open();
    expect(screen.getByRole("menu")).toBeTruthy();
    act(() => trigger.focus());
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("焦点移到菜单之外的其它元素时照常关闭", () => {
    const trigger = open();
    act(() => screen.getByRole("button", { name: "elsewhere", hidden: true }).focus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
