import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { Popconfirm } from "./popconfirm";
import { Button } from "./button";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(cleanup);

describe("Popconfirm 触发器语义", () => {
  it("直接以传入的真实按钮作为 trigger（不再外包 div，保留按钮语义）", () => {
    render(
      <Popconfirm description="确认?" onConfirm={vi.fn()}>
        <Button data-testid="trigger">{"删除"}</Button>
      </Popconfirm>
    );
    const trigger = screen.getByTestId("trigger");
    expect(trigger.tagName).toBe("BUTTON");
    // Radix 的 trigger 属性应直接落在真实按钮上
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    // 不应再有包裹交互元素的 div.grid
    expect(document.querySelector("div.grid")).toBeNull();
  });

  it("点击触发器弹出确认，点确认调用 onConfirm", async () => {
    const onConfirm = vi.fn();
    render(
      <Popconfirm description="确认删除?" onConfirm={onConfirm} confirmText="删除">
        <Button data-testid="t">{"删除"}</Button>
      </Popconfirm>
    );
    fireEvent.click(screen.getByTestId("t"));
    expect(await screen.findByText("确认删除?")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("popconfirm-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
