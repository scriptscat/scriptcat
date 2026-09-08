import { describe, expect, it } from "vitest";
import type { editor } from "monaco-editor";
import {
  contentChangeCanAffectMetadataMarkers,
  getMetadataAlignmentBlocks,
  getUndefinedMetadataTagMatches,
  isKnownMetadataTag,
  resolveMetadataTagBase,
} from "./metadata";

// 与 utils.test.ts 相同风格的简单 Monaco Editor 模型 mock
const createMockModel = (lines: string[]): editor.ITextModel => {
  return {
    getLineCount: () => lines.length,
    getLineContent: (lineNumber: number) => lines[lineNumber - 1] || "",
  } as editor.ITextModel;
};

const knownTags = new Set(["name", "description", "namespace", "grant", "match", "run-at", "noframes"]);

describe("getMetadataAlignmentBlocks", () => {
  it("应该识别成对闭合的 UserScript 区块", () => {
    const model = createMockModel([
      "// ==UserScript==",
      "// @name Test",
      "// @version 1.0",
      "// ==/UserScript==",
      "const x = 1;",
    ]);
    const blocks = getMetadataAlignmentBlocks(model);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ startLineNumber: 1, endLineNumber: 4 });
    expect(blocks[0].lines.map((line) => line.tag)).toEqual(["name", "version"]);
  });

  it("未闭合的区块不应产出任何区块（与运行时 parseMetadata 保持一致）", () => {
    const model = createMockModel(["// ==UserScript==", "// @name Test", "// @version 1.0", "const x = 1;"]);
    expect(getMetadataAlignmentBlocks(model)).toEqual([]);
  });

  it("只应扫描第一个成对闭合的区块，忽略其后的第二个区块", () => {
    const model = createMockModel([
      "// ==UserScript==",
      "// @name First",
      "// ==/UserScript==",
      "// ==UserScript==",
      "// @name Second",
      "// ==/UserScript==",
    ]);
    const blocks = getMetadataAlignmentBlocks(model);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lines[0].value).toBe("First");
  });

  it("闭合标记之前不构成区块的行不应被当成 metadata", () => {
    const model = createMockModel(["// @name Ignored", "// ==UserScript==", "// @name Test", "// ==/UserScript=="]);
    const blocks = getMetadataAlignmentBlocks(model);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].lines.map((line) => line.value)).toEqual(["Test"]);
  });
});

describe("resolveMetadataTagBase / isKnownMetadataTag", () => {
  it("本地化标签（name:<locale>）应解析为对应的基础标签", () => {
    expect(resolveMetadataTagBase("name:zh-CN")).toBe("name");
    expect(resolveMetadataTagBase("description:en")).toBe("description");
  });

  it("非本地化标签保持原样（小写化）", () => {
    expect(resolveMetadataTagBase("Grant")).toBe("grant");
    expect(resolveMetadataTagBase("run-at")).toBe("run-at");
  });

  it("已知的本地化标签应视为已定义", () => {
    expect(isKnownMetadataTag("name:zh-CN", knownTags)).toBe(true);
    expect(isKnownMetadataTag("description:ja", knownTags)).toBe(true);
  });

  it("已知的普通/连字符/大小写标签应视为已定义", () => {
    expect(isKnownMetadataTag("GRANT", knownTags)).toBe(true);
    expect(isKnownMetadataTag("run-at", knownTags)).toBe(true);
  });

  it("未知标签（包括未知标签的本地化变体）应视为未定义", () => {
    expect(isKnownMetadataTag("unknownTag", knownTags)).toBe(false);
    expect(isKnownMetadataTag("foo:zh-CN", knownTags)).toBe(false);
  });
});

describe("getUndefinedMetadataTagMatches", () => {
  it("应该跳过本地化标签,只标记真正未定义的标签", () => {
    const model = createMockModel([
      "// ==UserScript==",
      "// @name:zh-CN 脚本名称",
      "// @unknownTag foo",
      "// ==/UserScript==",
    ]);
    const blocks = getMetadataAlignmentBlocks(model);
    const matches = getUndefinedMetadataTagMatches(model, blocks, knownTags);
    expect(matches).toHaveLength(1);
    expect(matches[0].lineNumber).toBe(3);
  });

  it("应返回精确的列范围", () => {
    const model = createMockModel(["// ==UserScript==", "// @unknownTag foo", "// ==/UserScript=="]);
    const blocks = getMetadataAlignmentBlocks(model);
    const matches = getUndefinedMetadataTagMatches(model, blocks, knownTags);
    expect(matches).toEqual([{ lineNumber: 2, startColumn: 5, endColumn: 15 }]);
  });
});

const createChangeEvent = (
  changes: Array<{ startLineNumber: number; endLineNumber: number; text: string; rangeLength: number }>
): editor.IModelContentChangedEvent =>
  ({
    isFlush: false,
    isEolChange: false,
    changes: changes.map((change) => ({
      range: {
        startLineNumber: change.startLineNumber,
        endLineNumber: change.endLineNumber,
        startColumn: 1,
        endColumn: 1,
      },
      rangeLength: change.rangeLength,
      text: change.text,
    })),
  }) as unknown as editor.IModelContentChangedEvent;

describe("contentChangeCanAffectMetadataMarkers", () => {
  it("在已知区块行首插入字符（导致该行不再形似注释）时仍应触发重新计算", () => {
    // 编辑后行内容为 "x// @foo bar"（已不再匹配注释/metadata 正则），
    // 但该行位于上一次识别到的区块范围内，因此应视为可能影响 markers。
    const model = createMockModel(["// ==UserScript==", "x// @foo bar", "// ==/UserScript=="]);
    const event = createChangeEvent([{ startLineNumber: 2, endLineNumber: 2, text: "x", rangeLength: 0 }]);
    const knownBlockRange = { startLineNumber: 1, endLineNumber: 3 };
    expect(contentChangeCanAffectMetadataMarkers(model, event, knownBlockRange)).toBe(true);
  });

  it("区块外、且编辑后文本也不像注释的普通代码编辑不应触发重新计算", () => {
    const model = createMockModel(["// ==UserScript==", "// ==/UserScript==", "xconst y = 1;"]);
    const event = createChangeEvent([{ startLineNumber: 3, endLineNumber: 3, text: "x", rangeLength: 0 }]);
    const knownBlockRange = { startLineNumber: 1, endLineNumber: 2 };
    expect(contentChangeCanAffectMetadataMarkers(model, event, knownBlockRange)).toBe(false);
  });

  it("没有已知区块时，仍应依赖原有的行文本启发式判断", () => {
    const model = createMockModel(["// @name Test"]);
    const event = createChangeEvent([{ startLineNumber: 1, endLineNumber: 1, text: "x", rangeLength: 0 }]);
    expect(contentChangeCanAffectMetadataMarkers(model, event, null)).toBe(true);
  });
});
