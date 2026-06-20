import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScriptDropzone } from "./useScriptDropzone";

function dragEvent(type: string, opts: { types?: string[]; files?: File[] } = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as any;
  ev.dataTransfer = {
    types: opts.types ?? [],
    files: opts.files ?? [],
    items: (opts.files ?? []).map((f) => ({ kind: "file", getAsFile: () => f })),
  };
  return ev;
}

describe("useScriptDropzone", () => {
  it("拖入文件时 isDragActive 为 true,离开后为 false", () => {
    const { result } = renderHook(() => useScriptDropzone(() => {}));
    act(() => {
      window.dispatchEvent(dragEvent("dragenter", { types: ["Files"] }));
    });
    expect(result.current.isDragActive).toBe(true);
    act(() => {
      window.dispatchEvent(dragEvent("dragleave", { types: ["Files"] }));
    });
    expect(result.current.isDragActive).toBe(false);
  });

  it("拖入非文件(元素排序)不激活遮罩", () => {
    const { result } = renderHook(() => useScriptDropzone(() => {}));
    act(() => {
      window.dispatchEvent(dragEvent("dragenter", { types: ["text/plain"] }));
    });
    expect(result.current.isDragActive).toBe(false);
  });

  it("drop 文件时回调收到 items 且遮罩关闭", async () => {
    const onFiles = vi.fn();
    const { result } = renderHook(() => useScriptDropzone(onFiles));
    const file = new File(["// ==UserScript=="], "a.user.js");
    await act(async () => {
      window.dispatchEvent(dragEvent("dragenter", { types: ["Files"] }));
      window.dispatchEvent(dragEvent("drop", { types: ["Files"], files: [file] }));
      await Promise.resolve();
    });
    expect(onFiles).toHaveBeenCalledWith([{ file, handle: null }]);
    expect(result.current.isDragActive).toBe(false);
  });
});
