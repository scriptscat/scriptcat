import { describe, it, expect } from "vitest";
import type { SCMetadata } from "@App/app/repo/metadata";
import { deriveCompatMarks } from "./compat";

const build = (header: string) => {
  const code = `// ==UserScript==\n${header}// ==/UserScript==\n\nconsole.log(1);\n`;
  const metadata: SCMetadata = {};
  for (const line of header.split("\n")) {
    const m = /^\/\/ @(\S+)[ \t]*(.*)$/.exec(line);
    if (!m) continue;
    (metadata[m[1].toLowerCase()] ||= []).push(m[2].trim());
  }
  return { code, metadata };
};

describe("安装页兼容性标记", () => {
  it("全部受支持时不产生任何标记", () => {
    const { code, metadata } = build(`// @name X\n// @match *://a.com/*\n// @grant GM_setValue\n`);
    expect(deriveCompatMarks(metadata, code)).toEqual({ grants: new Map(), tags: [] });
  });

  it("标出脚本猫未实现的 @grant，并给出所在行", () => {
    const { code, metadata } = build(`// @name X\n// @grant GM_setValue\n// @grant GM_audio\n`);
    const marks = deriveCompatMarks(metadata, code);
    expect(marks.grants).toEqual(new Map([["GM_audio", 4]]));
  });

  it("@grant none 不是能力请求，不标记", () => {
    const { code, metadata } = build(`// @name X\n// @grant none\n`);
    expect(deriveCompatMarks(metadata, code).grants.size).toBe(0);
  });

  it("标出不生效的元数据指令，并给出所在行", () => {
    const { code, metadata } = build(`// @name X\n// @match *://a.com/*\n// @exclude-match *://b.com/*\n`);
    expect(deriveCompatMarks(metadata, code).tags).toEqual([{ tag: "exclude-match", line: 4 }]);
  });

  it("支持表之外的指令一律标出，不需要事先登记——别家以后新增的指令也不会漏", () => {
    const { code, metadata } = build(`// @name X\n// @match-website-only a.com\n// @sandbox raw\n`);
    expect(deriveCompatMarks(metadata, code).tags).toEqual([
      { tag: "match-website-only", line: 3 },
      { tag: "sandbox", line: 4 },
    ]);
  });

  it("同一指令写了多行只标一枚，行号取第一次出现处", () => {
    const { code, metadata } = build(`// @name X\n// @sandbox a\n// @sandbox b\n`);
    expect(deriveCompatMarks(metadata, code).tags).toEqual([{ tag: "sandbox", line: 3 }]);
  });

  it("代码里定位不到时仍然成条，只是没有行号——诊断不能因为缺位置而消失", () => {
    const metadata: SCMetadata = { name: ["X"], sandbox: ["raw"], grant: ["GM_audio"] };
    const marks = deriveCompatMarks(metadata, "");
    expect(marks.tags).toEqual([{ tag: "sandbox", line: undefined }]);
    expect(marks.grants).toEqual(new Map([["GM_audio", undefined]]));
  });

  it("标记顺序跟随代码出现顺序，便于与代码对读", () => {
    const { code, metadata } = build(`// @name X\n// @top-level-await\n// @sandbox raw\n`);
    expect(deriveCompatMarks(metadata, code).tags.map((t) => t.tag)).toEqual(["top-level-await", "sandbox"]);
  });
});
