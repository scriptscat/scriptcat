import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ListRow, ListRowActions, ListRowLeading, ListRowMain, ListRowTrailing } from "./list-row";

afterEach(cleanup);

describe("ListRow 列表行骨架", () => {
  it("组合四个槽位时各自带上 data-slot 标记", () => {
    render(
      <ListRow data-testid="row">
        <ListRowLeading>{"勾选"}</ListRowLeading>
        <ListRowMain>{"脚本 A"}</ListRowMain>
        <ListRowTrailing>{"3 天前"}</ListRowTrailing>
        <ListRowActions>{"操作"}</ListRowActions>
      </ListRow>
    );

    expect(screen.getByTestId("row")).toHaveAttribute("data-slot", "list-row");
    expect(screen.getByText("勾选")).toHaveAttribute("data-slot", "list-row-leading");
    expect(screen.getByText("脚本 A")).toHaveAttribute("data-slot", "list-row-main");
    expect(screen.getByText("3 天前")).toHaveAttribute("data-slot", "list-row-trailing");
    expect(screen.getByText("操作")).toHaveAttribute("data-slot", "list-row-actions");
  });

  it("中段使用 flex-1 与 min-w-0，长名称截断而非把右锚区挤出行外", () => {
    render(<ListRowMain>{"很长的脚本名"}</ListRowMain>);

    const main = screen.getByText("很长的脚本名");
    expect(main).toHaveClass("flex-1");
    expect(main).toHaveClass("min-w-0");
  });

  it("操作槽常驻半透明，悬停整行才转为完全不透明", () => {
    render(<ListRowActions>{"操作"}</ListRowActions>);

    const actions = screen.getByText("操作");
    expect(actions).toHaveClass("opacity-[0.55]");
    expect(actions).toHaveClass("group-hover/row:opacity-100");
  });

  it("选中态与禁用态各自改变行外观，且互不依赖", () => {
    const { rerender } = render(<ListRow data-testid="row" selected />);
    expect(screen.getByTestId("row")).toHaveClass("bg-primary/10");

    rerender(<ListRow data-testid="row" disabled />);
    const row = screen.getByTestId("row");
    expect(row).toHaveClass("opacity-60");
    expect(row).not.toHaveClass("bg-primary/10");
  });

  it("锚区宽度由消费者给出，骨架不预设——回收站无开关、脚本列表有开关，宽度不同", () => {
    render(
      <>
        <ListRowLeading className="w-8">{"回收站左锚"}</ListRowLeading>
        <ListRowLeading className="w-28">{"脚本列表左锚"}</ListRowLeading>
      </>
    );

    expect(screen.getByText("回收站左锚")).toHaveClass("w-8");
    expect(screen.getByText("脚本列表左锚")).toHaveClass("w-28");
  });
});
