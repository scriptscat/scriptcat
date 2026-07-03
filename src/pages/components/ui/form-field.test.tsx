import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./input";
import { FormField, SwitchField } from "./form-field";
import { Switch } from "./switch";

describe("FormField 表单字段", () => {
  it("关联标签、说明和错误", () => {
    render(
      <FormField label="名称" htmlFor="name" description="显示在列表中" error="不能为空" required>
        <Input id="name" aria-invalid />
      </FormField>
    );

    expect(screen.getByLabelText(/名称/)).toBeInTheDocument();
    expect(screen.getByText("显示在列表中")).toBeInTheDocument();
    expect(screen.getByText("不能为空")).toHaveClass("text-destructive");
  });

  it("横向开关字段使用同一套标签说明布局", () => {
    render(
      <SwitchField label="启用" description="立即生效">
        <Switch aria-label="启用" />
      </SwitchField>
    );

    expect(screen.getByText("启用")).toBeInTheDocument();
    expect(screen.getByText("立即生效")).toBeInTheDocument();
  });
});
