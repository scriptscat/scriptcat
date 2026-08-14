import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePreventEvent } from "./use-prevent-event";

describe("usePreventEvent", () => {
  it("应阻止 Radix 外部事件的默认行为", () => {
    const { result } = renderHook(() => usePreventEvent());
    const event = { preventDefault: vi.fn() };

    result.current(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});
