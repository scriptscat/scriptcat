import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentEntityCard } from "./AgentEntityCard";

afterEach(() => cleanup());

describe("AgentEntityCard 实体卡片", () => {
  it("默认渲染纵向卡片外壳", () => {
    render(<AgentEntityCard>{"模型"}</AgentEntityCard>);

    const card = screen.getByText("模型");
    expect(card).toHaveAttribute("data-slot", "agent-entity-card");
    expect(card).toHaveClass("flex-col");
    expect(card).toHaveClass("bg-card");
  });

  it("支持横向布局和禁用态", () => {
    render(
      <AgentEntityCard layout="row" disabled>
        {"任务"}
      </AgentEntityCard>
    );

    const card = screen.getByText("任务");
    expect(card).toHaveClass("flex");
    expect(card).toHaveClass("items-center");
    expect(card).toHaveClass("opacity-60");
    expect(card).toHaveAttribute("data-disabled", "true");
  });
});
