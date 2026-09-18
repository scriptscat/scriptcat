import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { getNameAvatarTone, NameAvatar } from "./NameAvatar";

afterEach(cleanup);

describe("NameAvatar 名称头像", () => {
  it("返回 label token 类名而不是硬编码颜色", () => {
    const tone = getNameAvatarTone("ScriptCat");
    expect(tone.bg).toMatch(/^bg-label-(green|blue|purple|orange|rose|teal|amber|indigo)-bg$/);
    expect(tone.text).toMatch(/^text-label-(green|blue|purple|orange|rose|teal|amber|indigo)-fg$/);
    expect(`${tone.bg} ${tone.text}`).not.toMatch(/#|hsl\(|rgb\(|dark:/);
  });

  it("哈希为负的种子仍映射到有效令牌", () => {
    // "Tampermonkey" 的字符串哈希为负数，覆盖取模索引的负值保护；若退化为单次取模会取到 undefined
    const tone = getNameAvatarTone("Tampermonkey");
    expect(tone).toBeDefined();
    expect(tone.bg).toMatch(/^bg-label-\w+-bg$/);
  });

  it("渲染时使用尺寸参数和设计令牌类", () => {
    const { getByText } = render(
      <NameAvatar seed="ScriptCat" size={20} rounded="rounded-full">
        {"S"}
      </NameAvatar>
    );
    const el = getByText("S");
    expect(el.style.width).toBe("20px");
    expect(el.style.height).toBe("20px");
    expect(el.className).toContain("rounded-full");
    expect(el.className).toMatch(/bg-label-\w+-bg/);
    expect(el.className).toMatch(/text-label-\w+-fg/);
  });
});
