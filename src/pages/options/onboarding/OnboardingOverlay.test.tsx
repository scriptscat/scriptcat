import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import type { TourStep } from "./types";

let currentStep: TourStep | null = {
  id: "a",
  target: "x1",
  titleKey: "guide:script_list_enable_title",
  contentKey: "guide:script_list_enable_content",
};
vi.mock("./OnboardingProvider", () => ({
  useOnboarding: () => ({ phase: "tour", currentStep, stepIndex: 0 }),
}));

import { OnboardingOverlay } from "./OnboardingOverlay";

beforeEach(() => {
  document.body.innerHTML = "";
  currentStep = {
    id: "a",
    target: "x1",
    titleKey: "guide:script_list_enable_title",
    contentKey: "guide:script_list_enable_content",
  };
});
afterEach(cleanup);

describe("聚光灯遮罩", () => {
  it("目标存在时应按 rect 渲染聚光灯洞", () => {
    const el = document.createElement("div");
    el.setAttribute("data-tour", "x1");
    document.body.appendChild(el);
    el.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 200, height: 40, right: 300, bottom: 90 }) as DOMRect;
    act(() => {
      render(<OnboardingOverlay />);
    });
    const hole = screen.getByTestId("onboarding-spotlight");
    expect(hole.getAttribute("x")).toBe("94"); // 100 - pad6
    expect(hole.getAttribute("width")).toBe("212"); // 200 + 12
  });

  it("center 步骤不应渲染聚光灯洞", () => {
    currentStep = {
      id: "c",
      target: "center",
      titleKey: "guide:script_list_enable_title",
      contentKey: "guide:script_list_enable_content",
    };
    act(() => {
      render(<OnboardingOverlay />);
    });
    expect(screen.queryByTestId("onboarding-spotlight")).toBeNull();
  });
});
