import { describe, expect, it } from "vitest";
import type { editor } from "monaco-editor";
import { escapeRegExp, findGlobalInsertionInfo, updateGlobalCommentLine } from "./utils";

// 创建一个简单的 Monaco Editor 模型 mock
const createMockModel = (lines: string[]): editor.ITextModel => {
  return {
    getLineCount: () => lines.length,
    getLineContent: (lineNumber: number) => lines[lineNumber - 1] || "",
  } as editor.ITextModel;
};

describe("findGlobalInsertionInfo", () => {
  it("应该在空文件中返回第1行作为插入位置", () => {
    const model = createMockModel([]);
    const result = findGlobalInsertionInfo(model);
    expect(result).toEqual({ insertLine: 1, globalLine: null });
  });

  it("应该在只有空行的文件中返回第1行", () => {
    const model = createMockModel(["", "", ""]);
    const result = findGlobalInsertionInfo(model);
    expect(result).toEqual({ insertLine: 1, globalLine: null });
  });

  it("应该跳过单行注释找到第一个非注释行", () => {
    const model = createMockModel(["// This is a comment", "// Another comment", "const x = 1;"]);
    const result = findGlobalInsertionInfo(model);
    expect(result).toEqual({ insertLine: 3, globalLine: null });
  });

  it("应该跳过块注释找到第一个非注释行", () => {
    const model = createMockModel(["/* This is a", "   multi-line comment */", "const x = 1;"]);
    const result = findGlobalInsertionInfo(model);
    expect(result).toEqual({ insertLine: 3, globalLine: null });
  });

  it("应该识别全局注释行", () => {
    const model = createMockModel(["/* global jQuery, $ */", "const x = 1;"]);
    const result = findGlobalInsertionInfo(model);
    expect(result).toEqual({ insertLine: 2, globalLine: 1 });
  });

  it("应该处理包含global关键字的多行块注释", () => {
    const model = createMockModel(["/* global jQuery,", "   axios */", "const x = 1;"]);
    const result = findGlobalInsertionInfo(model);
    expect(result).toEqual({ insertLine: 3, globalLine: 1 });
  });

  it("应该跳过所有注释和空行", () => {
    const model = createMockModel(["", "// Comment 1", "", "/* Block comment */", "", "const x = 1;"]);
    const result = findGlobalInsertionInfo(model);
    expect(result).toEqual({ insertLine: 6, globalLine: null });
  });

  it("应该处理只有注释的文件", () => {
    const model = createMockModel(["// Only comments", "/* Block comment */"]);
    const result = findGlobalInsertionInfo(model);
    expect(result).toEqual({ insertLine: 1, globalLine: null });
  });

  it("应该处理混合注释和global注释", () => {
    const model = createMockModel([
      "// Header comment",
      "/* global window, document */",
      "// Another comment",
      "const x = 1;",
    ]);
    const result = findGlobalInsertionInfo(model);
    expect(result).toEqual({ insertLine: 4, globalLine: 2 });
  });

  it("应该处理单行块注释", () => {
    const model = createMockModel(["/* Single line block comment */", "const x = 1;"]);
    const result = findGlobalInsertionInfo(model);
    expect(result).toEqual({ insertLine: 2, globalLine: null });
  });

  it("应该在有内容的行之前找到插入位置", () => {
    const model = createMockModel(["", "const x = 1;", "const y = 2;"]);
    const result = findGlobalInsertionInfo(model);
    expect(result).toEqual({ insertLine: 2, globalLine: null });
  });
});

describe("escapeRegExp", () => {
  it("应该转义正则表达式特殊字符", () => {
    expect(escapeRegExp("test.name")).toBe("test\\.name");
    expect(escapeRegExp("name$")).toBe("name\\$");
    expect(escapeRegExp("test[0]")).toBe("test\\[0\\]");
    expect(escapeRegExp("(test)")).toBe("\\(test\\)");
  });

  it("应该处理普通字符串", () => {
    expect(escapeRegExp("testName")).toBe("testName");
    expect(escapeRegExp("abc123")).toBe("abc123");
  });
});

describe("updateGlobalCommentLine", () => {
  it("如果全局变量已存在，应该返回原行", () => {
    const line = "/* global jQuery, $ */";
    const result = updateGlobalCommentLine(line, "jQuery");
    expect(result).toBe(line);
  });

  it("应该在注释末尾添加新的全局变量", () => {
    const line = "/* global jQuery */";
    const result = updateGlobalCommentLine(line, "axios");
    expect(result).toBe("/* global jQuery, axios */");
  });

  it("应该在只有global关键字的注释后添加变量", () => {
    const line = "/* global */";
    const result = updateGlobalCommentLine(line, "Vue");
    expect(result).toBe("/* global Vue */");
  });

  it("应该处理以逗号结尾的注释", () => {
    const line = "/* global jQuery, */";
    const result = updateGlobalCommentLine(line, "axios");
    expect(result).toBe("/* global jQuery, axios */");
  });

  it("应该处理多个已存在的全局变量", () => {
    const line = "/* global window, document, console */";
    const result = updateGlobalCommentLine(line, "fetch");
    expect(result).toBe("/* global window, document, console, fetch */");
  });

  it("应该处理注释后有额外内容的情况", () => {
    const line = "/* global jQuery */ // some comment";
    const result = updateGlobalCommentLine(line, "axios");
    expect(result).toBe("/* global jQuery, axios */ // some comment");
  });

  it("应该处理格式不正确的注释（缺少*/）", () => {
    const line = "/* global jQuery";
    const result = updateGlobalCommentLine(line, "axios");
    expect(result).toBe("/* global jQuery, axios");
  });

  it("应该避免重复添加相同的全局变量", () => {
    const line = "/* global jQuery, axios */";
    const result = updateGlobalCommentLine(line, "jQuery");
    expect(result).toBe(line);
  });

  it("应该正确处理包含特殊字符的变量名", () => {
    const line = "/* global $ */";
    const result = updateGlobalCommentLine(line, "jQuery");
    expect(result).toBe("/* global $, jQuery */");

    const result2 = updateGlobalCommentLine(result, "$");
    expect(result2).toBe(result); // $ 已经存在
  });

  it("应该处理变量名是已存在变量子串的情况", () => {
    const line = "/* global myVariable */";
    const result = updateGlobalCommentLine(line, "my");
    expect(result).toBe("/* global myVariable, my */");

    const line2 = "/* global my */";
    const result2 = updateGlobalCommentLine(line2, "myVariable");
    expect(result2).toBe("/* global my, myVariable */");
  });
});
