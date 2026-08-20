import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const sonnerProps = vi.fn();
vi.mock("sonner", () => ({
  Toaster: (props: Record<string, unknown>) => {
    sonnerProps(props);
    return null;
  },
}));
vi.mock("@App/pages/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
const isMobile = vi.fn();
vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: () => isMobile() }));

import { Toaster } from "./sonner";

describe("Toaster 容器", () => {
  beforeEach(() => vi.clearAllMocks());

  it("桌面端应使用 bottom-right", () => {
    isMobile.mockReturnValue(false);
    render(<Toaster />);
    expect(sonnerProps).toHaveBeenCalledWith(
      expect.objectContaining({ position: "bottom-right", offset: { bottom: 24, right: 24 } })
    );
  });

  it("移动端应使用 top-center", () => {
    isMobile.mockReturnValue(true);
    render(<Toaster />);
    expect(sonnerProps).toHaveBeenCalledWith(expect.objectContaining({ position: "top-center" }));
  });

  it("决策页在桌面端应改用 top-center，避免压住吸底操作栏按钮", () => {
    isMobile.mockReturnValue(false);
    render(<Toaster placement="decision" />);
    expect(sonnerProps).toHaveBeenCalledWith(expect.objectContaining({ position: "top-center", offset: { top: 24 } }));
  });

  it("决策页在移动端应与普通页一致，仍为 top-center", () => {
    isMobile.mockReturnValue(true);
    render(<Toaster placement="decision" />);
    expect(sonnerProps).toHaveBeenCalledWith(expect.objectContaining({ position: "top-center", offset: { top: 12 } }));
  });

  it("placement 不应作为未知属性透传给 sonner", () => {
    isMobile.mockReturnValue(false);
    render(<Toaster placement="decision" />);
    expect(sonnerProps.mock.calls.at(-1)![0].placement).toBeUndefined();
  });

  it("应去掉 richColors、开启 closeButton 与 visibleToasts=3", () => {
    isMobile.mockReturnValue(false);
    render(<Toaster />);
    const props = sonnerProps.mock.calls.at(-1)![0];
    expect(props.richColors).toBeUndefined();
    expect(props.closeButton).toBe(true);
    expect(props.visibleToasts).toBe(3);
  });
});
