import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Checkbox } from "./checkbox";

afterEach(cleanup);

describe("Checkbox 半选状态显示", () => {
  it("checked 为 true 时显示对勾图标，不显示减号", () => {
    const { container } = render(<Checkbox checked />);
    expect(container.querySelector("svg.lucide-check")).not.toBeNull();
    expect(container.querySelector("svg.lucide-minus")).toBeNull();
  });

  it('checked 为 "indeterminate" 时显示减号图标，而非对勾（半选与全选不能看起来一样）', () => {
    const { container } = render(<Checkbox checked="indeterminate" />);
    expect(container.querySelector("svg.lucide-minus")).not.toBeNull();
    expect(container.querySelector("svg.lucide-check")).toBeNull();
  });
});
