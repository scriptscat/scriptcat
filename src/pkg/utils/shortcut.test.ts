// can be tested with vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { formatShortcut, isMacOS } from "./shortcut";

describe("formatShortcut 快捷键格式化", () => {
  it("在 Windows/Linux 下应以 Ctrl 加号连接", () => {
    expect(formatShortcut(["mod", "S"], false)).toBe("Ctrl+S");
  });

  it("在 Mac 下应将 mod 显示为 ⌘ 图标且不带加号", () => {
    expect(formatShortcut(["mod", "S"], true)).toBe("⌘S");
  });

  it("在 Windows 下含 Shift 的组合应为 Ctrl+Shift+S", () => {
    expect(formatShortcut(["mod", "shift", "S"], false)).toBe("Ctrl+Shift+S");
  });

  it("在 Mac 下应按 ⌃⌥⇧⌘ 顺序排列修饰键并用图标替代", () => {
    expect(formatShortcut(["mod", "shift", "S"], true)).toBe("⇧⌘S");
    expect(formatShortcut(["mod", "alt", "shift", "S"], true)).toBe("⌥⇧⌘S");
  });

  it("功能键（如 F5）应原样保留", () => {
    expect(formatShortcut(["mod", "F5"], false)).toBe("Ctrl+F5");
    expect(formatShortcut(["mod", "F5"], true)).toBe("⌘F5");
  });
});

describe("isMacOS 平台判定", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("userAgentData.platform 为 macOS 时应判定为 Mac", () => {
    vi.stubGlobal("navigator", { userAgentData: { platform: "macOS" }, userAgent: "" });
    expect(isMacOS()).toBe(true);
  });

  it("无 userAgentData 时应回退到 userAgent 中的 Macintosh 判定", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    });
    expect(isMacOS()).toBe(true);
  });

  it("Windows 下应判定为非 Mac", () => {
    vi.stubGlobal("navigator", {
      userAgentData: { platform: "Windows" },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });
    expect(isMacOS()).toBe(false);
  });
});
