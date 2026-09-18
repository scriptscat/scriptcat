import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useCanHover } from "./use-can-hover";

afterEach(cleanup);

// 可控的 matchMedia mock:matches 可变、change 监听器可手动触发
function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

describe("useCanHover 指针 hover 能力", () => {
  it("触摸屏返回 false,接上鼠标后更新为 true", () => {
    const mql = stubMatchMedia(false);
    const { result } = renderHook(() => useCanHover());
    expect(result.current).toBe(false);
    act(() => mql.setMatches(true));
    expect(result.current).toBe(true);
  });
});
