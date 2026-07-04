import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";

const startTour = vi.fn();
const skip = vi.fn();
let mode: "desktop" | "mobile" = "desktop";
vi.mock("./OnboardingProvider", () => ({
  useOnboarding: () => ({ phase: "welcome", mode, startTour, skip }),
}));

import { WelcomeDialog } from "./WelcomeDialog";

beforeEach(() => {
  initTestLanguage("en-US");
  mockMatchMedia();
  startTour.mockReset();
  skip.mockReset();
  mode = "desktop";
});
afterEach(cleanup);

describe("欢迎弹窗", () => {
  it("应显示标题与三个要点", () => {
    render(<WelcomeDialog />);
    expect(screen.getByText("Welcome to ScriptCat 🎉")).toBeInTheDocument();
    expect(screen.getByText("Manage installed scripts")).toBeInTheDocument();
    expect(screen.getByText("Install from the script market")).toBeInTheDocument();
    expect(screen.getByText("Never lose your scripts")).toBeInTheDocument();
  });

  it("应展示真实 logo 图片而非占位图标", () => {
    render(<WelcomeDialog />);
    const logo = screen.getByAltText("ScriptCat");
    expect(logo.tagName).toBe("IMG");
    expect(logo.getAttribute("src")).toContain("assets/logo.png");
  });

  it("点开始导览应调用 startTour", () => {
    render(<WelcomeDialog />);
    fireEvent.click(screen.getByText("Start tour"));
    expect(startTour).toHaveBeenCalled();
  });

  it("点稍后再说应调用 skip", () => {
    render(<WelcomeDialog />);
    fireEvent.click(screen.getByText("Maybe later"));
    expect(skip).toHaveBeenCalled();
  });

  it("移动端应以 Sheet 形式渲染欢迎", () => {
    mode = "mobile";
    render(<WelcomeDialog />);
    expect(screen.getByText("Welcome to ScriptCat 🎉")).toBeInTheDocument();
    expect(screen.getByText("Start tour")).toBeInTheDocument();
    expect(screen.getByText("Maybe later")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Start tour"));
    expect(startTour).toHaveBeenCalled();
  });
});
