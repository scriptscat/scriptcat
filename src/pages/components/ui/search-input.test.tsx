import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchInput } from "./search-input";

describe("SearchInput 搜索输入框", () => {
  it("渲染带可访问名称的搜索框", () => {
    render(<SearchInput aria-label="搜索脚本" placeholder="搜索脚本" />);

    const input = screen.getByRole("searchbox", { name: "搜索脚本" });
    expect(input).toHaveAttribute("placeholder", "搜索脚本");
  });

  it("支持尾部操作插槽", () => {
    render(<SearchInput aria-label="搜索" trailing={<button type="button">{"范围"}</button>} />);

    expect(screen.getByRole("button", { name: "范围" })).toBeInTheDocument();
  });
});
