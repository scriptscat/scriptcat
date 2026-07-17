import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchInput } from "./search-input";

describe("SearchInput 搜索输入框", () => {
  it("渲染带可访问名称的搜索框", () => {
    render(<SearchInput aria-label="搜索脚本" placeholder="搜索脚本" />);

    const input = screen.getByLabelText("搜索脚本");
    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveAttribute("placeholder", "搜索脚本");
  });
});
