// src/pages/options/hooks/useScrollSpy.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { selectActiveId, useScrollSpy } from "./useScrollSpy";

describe("选择高亮分区 selectActiveId", () => {
  // 各分区相对滚动容器顶部的 top(px)；触发线固定在 96px
  const LINE = 96;
  const ids = ["general", "interface", "sync"];
  const at = (tops: Record<string, number>) => (id: string) => tops[id];

  it("滚动到顶部且首个分区高度小于触发线时，仍激活第一个分区", () => {
    // general 仅一行(顶部 24)，紧随其后的 interface(154) 已越过触发线
    const active = selectActiveId(ids, at({ general: 24, interface: 154, sync: 360 }), LINE, false);
    expect(active).toBe("general");
  });

  it("滚动到中部时激活触发线之上最靠下的分区", () => {
    const active = selectActiveId(ids, at({ general: -220, interface: -40, sync: 130 }), LINE, false);
    expect(active).toBe("interface");
  });

  it("触底时强制激活最后一个分区(尾部分区过短无法滚到触发线)", () => {
    // 触发线之上最靠下的是 interface，但触底应直接高亮 sync
    const active = selectActiveId(ids, at({ general: -800, interface: -600, sync: 380 }), LINE, true);
    expect(active).toBe("sync");
  });

  it("分区列表为空时返回空串", () => {
    expect(selectActiveId([], () => undefined, LINE, false)).toBe("");
  });
});

describe("滚动监听 useScrollSpy", () => {
  it("初始激活第一个分区", () => {
    const { result } = renderHook(() => useScrollSpy(["a", "b", "c"]));
    expect(result.current.activeId).toBe("a");
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
