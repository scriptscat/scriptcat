import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Server } from "lucide-react";
import { AgentEmptyState } from "./AgentEmptyState";

afterEach(() => cleanup());

describe("AgentEmptyState 空状态", () => {
  it("复用统一状态屏语义", () => {
    render(<AgentEmptyState icon={Server} title="t" description="d" />);
    const root = screen.getByTestId("empty-state");
    expect(root).toHaveAttribute("data-slot", "state-screen");
    expect(root).toHaveAttribute("role", "status");
  });
  it("无 action 时仍正常渲染", () => {
    render(<AgentEmptyState icon={Server} title="空" description="说明" />);
    expect(screen.getByText("空")).toBeInTheDocument();
    expect(screen.getByText("说明")).toBeInTheDocument();
  });
});
