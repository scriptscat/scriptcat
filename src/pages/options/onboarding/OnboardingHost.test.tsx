import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

let phase: "welcome" | "tour" | null = null;
vi.mock("./OnboardingProvider", () => ({ useOnboarding: () => ({ phase }) }));
vi.mock("./WelcomeDialog", () => ({ WelcomeDialog: () => <div data-testid="welcome" /> }));
vi.mock("./OnboardingOverlay", () => ({ OnboardingOverlay: () => <div data-testid="overlay" /> }));
vi.mock("./OnboardingPopover", () => ({ OnboardingPopover: () => <div data-testid="popover" /> }));

import { OnboardingHost } from "./OnboardingHost";

beforeEach(() => {
  phase = null;
});
afterEach(cleanup);

describe("引导宿主", () => {
  it("phase 为 null 时不渲染任何引导", () => {
    render(<OnboardingHost />);
    expect(screen.queryByTestId("welcome")).toBeNull();
    expect(screen.queryByTestId("overlay")).toBeNull();
  });

  it("welcome 阶段渲染欢迎弹窗", () => {
    phase = "welcome";
    render(<OnboardingHost />);
    expect(screen.getByTestId("welcome")).toBeInTheDocument();
  });

  it("tour 阶段渲染遮罩与步骤卡", () => {
    phase = "tour";
    render(<OnboardingHost />);
    expect(screen.getByTestId("overlay")).toBeInTheDocument();
    expect(screen.getByTestId("popover")).toBeInTheDocument();
  });
});
