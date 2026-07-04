import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { TourStep } from "./types";

const next = vi.fn();
const prev = vi.fn();
const skip = vi.fn();
const finish = vi.fn();
let stepIndex = 0;
const steps: TourStep[] = [
  {
    id: "a",
    target: "center",
    titleKey: "guide:script_list_enable_title",
    contentKey: "guide:script_list_enable_content",
  },
  { id: "b", target: "center", titleKey: "guide:setting_sync_title", contentKey: "guide:setting_sync_content" },
];
vi.mock("./OnboardingProvider", () => ({
  useOnboarding: () => ({
    phase: "tour",
    steps,
    stepIndex,
    currentStep: steps[stepIndex],
    next,
    prev,
    skip,
    finish,
  }),
}));

import { OnboardingPopover } from "./OnboardingPopover";

beforeAll(() => initTestLanguage("en-US"));

beforeEach(() => {
  stepIndex = 0;
  next.mockReset();
  prev.mockReset();
  skip.mockReset();
  finish.mockReset();
});
afterEach(cleanup);

describe("巡览步骤卡", () => {
  it("应显示标题、进度与下一步按钮", () => {
    render(<OnboardingPopover />);
    expect(screen.getByText("Enable Scripts")).toBeInTheDocument(); // guide:script_list_enable_title 的 en-US 值
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Next"));
    expect(next).toHaveBeenCalled();
  });

  it("最后一步应显示完成按钮", () => {
    stepIndex = 1;
    render(<OnboardingPopover />);
    fireEvent.click(screen.getByText("Done"));
    expect(finish).toHaveBeenCalled();
  });

  it("按 Esc 应退出引导", () => {
    render(<OnboardingPopover />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(skip).toHaveBeenCalled();
  });

  it("气泡根元素应可聚焦（tabIndex -1）", () => {
    render(<OnboardingPopover />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("tabindex", "-1");
  });

  it("窗口 resize 时应按目标最新位置重新定位", () => {
    const orig = steps[0];
    const target = document.createElement("div");
    target.setAttribute("data-tour", "reposition-target");
    document.body.appendChild(target);
    const makeRect = (left: number): DOMRect =>
      ({
        left,
        top: 100,
        right: left + 50,
        bottom: 130,
        width: 50,
        height: 30,
        x: left,
        y: 100,
        toJSON() {},
      }) as DOMRect;
    let rect = makeRect(100);
    target.getBoundingClientRect = () => rect;
    steps[0] = { ...orig, target: "reposition-target", placement: "bottom" };
    try {
      render(<OnboardingPopover />);
      const dialog = screen.getByRole("dialog");
      expect(dialog.style.left).toBe("100px");
      // 目标移动后触发 resize，气泡应跟随到新位置
      rect = makeRect(300);
      fireEvent(window, new Event("resize"));
      expect(dialog.style.left).toBe("300px");
    } finally {
      steps[0] = orig;
      target.remove();
    }
  });
});
