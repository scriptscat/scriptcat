// @vitest-environment happy-dom
// src/pages/options/hooks/useScrollSpy.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScrollSpy } from "./useScrollSpy";

// 收集创建的 IntersectionObserver 实例，便于手动触发回调
type IOEntry = {
  target: Element;
  isIntersecting: boolean;
  intersectionRatio: number;
  boundingClientRect: { top: number };
};
const observers: Array<{ cb: IntersectionObserverCallback; elements: Set<Element> }> = [];

beforeEach(() => {
  observers.length = 0;
  // @ts-expect-error 测试桩
  globalThis.IntersectionObserver = class {
    cb: IntersectionObserverCallback;
    elements = new Set<Element>();
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb;
      observers.push({ cb, elements: this.elements });
    }
    observe(el: Element) {
      this.elements.add(el);
    }
    unobserve(el: Element) {
      this.elements.delete(el);
    }
    disconnect() {
      this.elements.clear();
    }
    takeRecords() {
      return [];
    }
  };
});

function fireIntersect(entries: IOEntry[]) {
  act(() => {
    observers[0].cb(entries as unknown as IntersectionObserverEntry[], observers[0] as unknown as IntersectionObserver);
  });
}

describe("滚动监听 useScrollSpy", () => {
  it("初始激活第一个分区", () => {
    const { result } = renderHook(() => useScrollSpy(["a", "b", "c"]));
    expect(result.current.activeId).toBe("a");
  });

  it("分区进入视口上部时激活其对应导航", () => {
    const { result } = renderHook(() => useScrollSpy(["a", "b", "c"]));
    const elB = document.createElement("div");
    elB.dataset.spyId = "b";
    act(() => {
      result.current.register("b")(elB);
    });
    fireIntersect([{ target: elB, isIntersecting: true, intersectionRatio: 1, boundingClientRect: { top: 10 } }]);
    expect(result.current.activeId).toBe("b");
  });

  it("点击导航 scrollTo 立即激活目标并调用平滑滚动", () => {
    const { result } = renderHook(() => useScrollSpy(["a", "b", "c"]));
    const elC = document.createElement("div");
    const scrollIntoView = vi.fn();
    elC.scrollIntoView = scrollIntoView;
    act(() => {
      result.current.register("c")(elC);
    });
    act(() => {
      result.current.scrollTo("c");
    });
    expect(result.current.activeId).toBe("c");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });
});
