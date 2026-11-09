import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { SearchInput } from "./search-input";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(cleanup);

describe("SearchInput 搜索输入框", () => {
  it("渲染带可访问名称的搜索框", () => {
    render(<SearchInput aria-label="搜索脚本" placeholder="搜索脚本" />);

    const input = screen.getByLabelText("搜索脚本");
    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveAttribute("placeholder", "搜索脚本");
  });

  it("有输入内容时显示清除按钮，点击后调用 onClear 并把焦点还给输入框", () => {
    const onClear = vi.fn();
    render(<SearchInput aria-label="搜索脚本" value="GHSA" onChange={() => {}} onClear={onClear} />);

    fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("搜索脚本")).toHaveFocus();
  });

  it("输入为空时不显示清除按钮", () => {
    render(<SearchInput aria-label="搜索脚本" value="" onChange={() => {}} onClear={() => {}} />);

    expect(screen.queryByRole("button", { name: "清除搜索" })).not.toBeInTheDocument();
  });
});
