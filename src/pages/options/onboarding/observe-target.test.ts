import { describe, it, expect, vi, afterEach } from "vitest";
import { observeTarget } from "./observe-target";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("observeTarget", () => {
  it("center 应立即回调 null", () => {
    const cb = vi.fn();
    observeTarget("center", cb);
    expect(cb).toHaveBeenCalledWith(null);
  });

  it("目标已存在应同步命中", () => {
    const el = document.createElement("div");
    el.setAttribute("data-tour", "x1");
    document.body.appendChild(el);
    const cb = vi.fn();
    observeTarget("x1", cb);
    expect(cb).toHaveBeenCalledWith(el);
  });

  it("目标稍后挂载应在超时内命中", async () => {
    const cb = vi.fn();
    observeTarget("late", cb, { timeout: 1000 });
    expect(cb).not.toHaveBeenCalled();
    const el = document.createElement("div");
    el.setAttribute("data-tour", "late");
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 50));
    expect(cb).toHaveBeenCalledWith(el);
  });

  it("cleanup 后不应再回调", async () => {
    const cb = vi.fn();
    const stop = observeTarget("cancelMe", cb, { timeout: 1000 });
    stop();
    const el = document.createElement("div");
    el.setAttribute("data-tour", "cancelMe");
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 50));
    expect(cb).not.toHaveBeenCalled();
  });

  it("超时后应回调 null", async () => {
    const cb = vi.fn();
    observeTarget("never", cb, { timeout: 30 });
    await new Promise((r) => setTimeout(r, 80));
    expect(cb).toHaveBeenCalledWith(null);
  });
});
