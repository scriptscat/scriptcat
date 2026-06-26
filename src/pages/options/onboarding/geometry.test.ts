import { describe, it, expect, afterEach } from "vitest";
import { spotlightBox, getTargetRect } from "./geometry";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("聚光灯几何", () => {
  it("spotlightBox 应在目标四周加 padding", () => {
    const box = spotlightBox({ left: 100, top: 50, width: 200, height: 40 }, 6);
    expect(box).toEqual({ x: 94, y: 44, width: 212, height: 52 });
  });

  it("getTargetRect 对 center 应返回 null", () => {
    expect(getTargetRect("center")).toBeNull();
  });

  it("getTargetRect 找不到元素应返回 null", () => {
    expect(getTargetRect("nope")).toBeNull();
  });

  it("getTargetRect 应按 data-tour 命中元素", () => {
    const el = document.createElement("div");
    el.setAttribute("data-tour", "x1");
    document.body.appendChild(el);
    el.getBoundingClientRect = () => ({ left: 1, top: 2, width: 3, height: 4 }) as DOMRect;
    expect(getTargetRect("x1")?.left).toBe(1);
  });
});
