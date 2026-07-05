import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataPanel, DataPanelEmpty, DataPanelHeader, DataPanelRow } from "./data-panel";

describe("DataPanel 数据面板", () => {
  it("组合表头、行和空状态时保持统一面板结构", () => {
    render(
      <DataPanel data-testid="panel">
        <DataPanelHeader>{"名称"}</DataPanelHeader>
        <DataPanelRow>{"脚本 A"}</DataPanelRow>
      </DataPanel>
    );

    expect(screen.getByTestId("panel")).toHaveClass("overflow-hidden");
    expect(screen.getByText("名称")).toHaveAttribute("data-slot", "data-panel-header");
    expect(screen.getByText("脚本 A")).toHaveAttribute("data-slot", "data-panel-row");
  });

  it("空状态行使用居中文案", () => {
    render(<DataPanelEmpty>{"暂无数据"}</DataPanelEmpty>);

    expect(screen.getByText("暂无数据")).toHaveClass("text-muted-foreground");
  });
});
