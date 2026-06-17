import { describe, it, expect, vi, afterEach } from "vitest";
import { pickScriptFiles } from "./filePicker";

afterEach(() => { vi.unstubAllGlobals(); });

describe("filePicker", () => {
  it("有 showOpenFilePicker 时返回带 handle 的项", async () => {
    const file = new File(["// ==UserScript=="], "a.user.js");
    const handle = { kind: "file", getFile: async () => file };
    vi.stubGlobal("showOpenFilePicker", vi.fn(async () => [handle]));
    const items = await pickScriptFiles();
    expect(items).toHaveLength(1);
    expect(items[0].handle).toBe(handle);
    expect(items[0].file).toBe(file);
  });

  it("用户取消选择返回空数组", async () => {
    vi.stubGlobal("showOpenFilePicker", vi.fn(async () => { throw new DOMException("abort", "AbortError"); }));
    const items = await pickScriptFiles();
    expect(items).toEqual([]);
  });
});
