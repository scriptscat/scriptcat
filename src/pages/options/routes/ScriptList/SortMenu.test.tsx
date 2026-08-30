import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { SortMenu } from "./SortMenu";

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

// Radix 下拉需要 pointerDown 才会展开（同 FilterBar.test.tsx 的既有写法）
function openMenu() {
  const trigger = screen.getByTestId("sort-menu");
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
}

const options = [
  { key: "status", label: "状态" },
  { key: "name", label: "名称" },
] as const;

describe("SortMenu 排序下拉", () => {
  it("未排序时显示默认项，表头消失后仍能看出当前排序维度", () => {
    render(<SortMenu options={[...options]} value={{ key: null, order: "asc" }} onChange={vi.fn()} />);

    expect(screen.getByTestId("sort-menu")).toHaveTextContent("默认");
  });

  it("已排序时显示该维度的名称", () => {
    render(<SortMenu options={[...options]} value={{ key: "name", order: "asc" }} onChange={vi.fn()} />);

    expect(screen.getByTestId("sort-menu")).toHaveTextContent("名称");
  });

  it("点击未激活项按升序排序", () => {
    const onChange = vi.fn();
    render(<SortMenu options={[...options]} value={{ key: null, order: "asc" }} onChange={onChange} />);

    openMenu();
    fireEvent.click(screen.getByText("状态"));

    expect(onChange).toHaveBeenCalledWith({ key: "status", order: "asc" });
  });

  it("重复点击同一项走升序→降序→取消的三态循环", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SortMenu options={[...options]} value={{ key: "status", order: "asc" }} onChange={onChange} />
    );

    openMenu();
    fireEvent.click(screen.getByText("状态"));
    expect(onChange).toHaveBeenLastCalledWith({ key: "status", order: "desc" });

    rerender(<SortMenu options={[...options]} value={{ key: "status", order: "desc" }} onChange={onChange} />);
    openMenu();
    fireEvent.click(screen.getByText("状态"));
    expect(onChange).toHaveBeenLastCalledWith({ key: null, order: "asc" });
  });

  it("菜单里有「默认」项，一步回到自然顺序（拖拽顺序）", () => {
    const onChange = vi.fn();
    render(<SortMenu options={[...options]} value={{ key: "name", order: "desc" }} onChange={onChange} />);

    openMenu();
    fireEvent.click(screen.getByText("默认"));

    expect(onChange).toHaveBeenCalledWith({ key: null, order: "asc" });
  });
});
