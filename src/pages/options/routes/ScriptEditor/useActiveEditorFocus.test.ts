// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import type { RefObject } from "react";
import type { editor } from "monaco-editor";
import { useActiveEditorFocus } from "./useActiveEditorFocus";

afterEach(cleanup);

// 用最小桩对象冒充 Monaco 实例,只关心 focus 是否被调用
function makeEditorsRef(focusMap: Record<string, () => void>) {
  const map = new Map<string, editor.IStandaloneCodeEditor>();
  for (const [uuid, focus] of Object.entries(focusMap)) {
    map.set(uuid, { focus } as unknown as editor.IStandaloneCodeEditor);
  }
  return { current: map } as RefObject<Map<string, editor.IStandaloneCodeEditor>>;
}

describe("useActiveEditorFocus 切换标签恢复编辑器焦点", () => {
  it("激活标签变化时应聚焦对应编辑器", () => {
    const focusA = vi.fn();
    const focusB = vi.fn();
    const editorsRef = makeEditorsRef({ a: focusA, b: focusB });

    const { rerender } = renderHook(({ uuid }) => useActiveEditorFocus(uuid, editorsRef), {
      initialProps: { uuid: "a" as string | undefined },
    });

    expect(focusA).toHaveBeenCalledTimes(1);
    expect(focusB).not.toHaveBeenCalled();

    rerender({ uuid: "b" });

    expect(focusB).toHaveBeenCalledTimes(1);
  });

  it("activeUuid 为空时不聚焦任何编辑器", () => {
    const focusA = vi.fn();
    const editorsRef = makeEditorsRef({ a: focusA });

    renderHook(() => useActiveEditorFocus(undefined, editorsRef));

    expect(focusA).not.toHaveBeenCalled();
  });

  it("目标编辑器尚未挂载时不应抛错", () => {
    const editorsRef = makeEditorsRef({});

    expect(() => renderHook(() => useActiveEditorFocus("missing", editorsRef))).not.toThrow();
  });

  it("activeUuid 不变重渲染时不应重复聚焦", () => {
    const focusA = vi.fn();
    const editorsRef = makeEditorsRef({ a: focusA });

    const { rerender } = renderHook(({ uuid }) => useActiveEditorFocus(uuid, editorsRef), {
      initialProps: { uuid: "a" as string | undefined },
    });

    rerender({ uuid: "a" });

    expect(focusA).toHaveBeenCalledTimes(1);
  });
});
