import { describe, it, expect } from "vitest";
import { sliceLines, grepLines, MAX_GREP_LINE_LENGTH } from "./source";
import { ExternalAccessBridgeError } from "./errors";

describe("sliceLines（scripts.source.get 的行开窗，1-based 闭区间）", () => {
  it("不传 startLine/endLine 时返回整份代码，窗口即 [1, totalLines]", () => {
    const code = "a\nb\nc";
    const result = sliceLines(code);
    expect(result).toEqual({ code: "a\nb\nc", startLine: 1, endLine: 3, totalLines: 3 });
  });

  it("按 1-based 闭区间切出中间几行", () => {
    const code = "line1\nline2\nline3\nline4\nline5";
    const result = sliceLines(code, 2, 4);
    expect(result).toEqual({ code: "line2\nline3\nline4", startLine: 2, endLine: 4, totalLines: 5 });
  });

  it('join("\\n") 严格可逆：CRLF 的 \\r 留在行尾原样往返', () => {
    // split 只按 "\n" 断行，"\r" 留在每行末尾；join("\n") 拼回时逐字节复原，包括这个 "\r"。
    const code = "a\r\nb\r\nc";
    const result = sliceLines(code, 1, 2);
    expect(result.code).toBe("a\r\nb\r");
    expect(result.code.split("\n").join("\n")).toBe(result.code);
  });

  it("endLine 超出总行数时静默截断到 totalLines，不报错", () => {
    const code = "a\nb\nc";
    const result = sliceLines(code, 2, 100);
    expect(result).toEqual({ code: "b\nc", startLine: 2, endLine: 3, totalLines: 3 });
  });

  it("只给 startLine 不给 endLine（或反之）→ INVALID_REQUEST", () => {
    expect(() => sliceLines("a\nb\nc", 1, undefined)).toThrow(ExternalAccessBridgeError);
    expect(() => sliceLines("a\nb\nc", undefined, 2)).toThrow(ExternalAccessBridgeError);
  });

  it("startLine < 1 报 INVALID_REQUEST", () => {
    try {
      sliceLines("a\nb\nc", 0, 1);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExternalAccessBridgeError);
      expect((e as ExternalAccessBridgeError).code).toBe("INVALID_REQUEST");
    }
  });

  it("endLine < startLine 报 INVALID_REQUEST", () => {
    try {
      sliceLines("a\nb\nc", 3, 2);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExternalAccessBridgeError);
      expect((e as ExternalAccessBridgeError).code).toBe("INVALID_REQUEST");
    }
  });

  it("startLine/endLine 为 NaN 或非整数报 INVALID_REQUEST，不产出 NaN 行窗或与切片对不上的窗口", () => {
    // NaN 会穿过所有 < / > 比较，Math.min(NaN, n) 也是 NaN，最终把 NaN 写进返回值的行窗字段
    // （JSON 序列化后变成 null）；小数则让回报的 startLine 与实际切出的行对不上。
    expect(() => sliceLines("a\nb\nc", Number.NaN, Number.NaN)).toThrow(ExternalAccessBridgeError);
    expect(() => sliceLines("a\nb\nc\nd", 1.5, 3.5)).toThrow(ExternalAccessBridgeError);
  });

  it("startLine > totalLines 报 INVALID_REQUEST", () => {
    try {
      sliceLines("a\nb\nc", 10, 12);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExternalAccessBridgeError);
      expect((e as ExternalAccessBridgeError).code).toBe("INVALID_REQUEST");
    }
  });
});

describe("grepLines（scripts.source.grep 的逐行匹配，不复用 stringMatching）", () => {
  const code = ["import fs from 'fs'", "// TODO: fix a.b*c?", "const a = 1", "export default a"].join("\n");

  it("text 档（默认）是纯字面量子串匹配，*/?/. 不具备通配语义", () => {
    const result = grepLines(code, "a.b*c?");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ lineNumber: 2, line: "// TODO: fix a.b*c?" });
    // 若被当作正则/glob 解释，"a.b*c?" 会额外命中 "const a = 1" 等行——纯字面量档不应该。
    expect(result.totalMatches).toBe(1);
  });

  it("text 档 ignoreCase 为真时大小写不敏感", () => {
    const result = grepLines(code, "IMPORT", { ignoreCase: true });
    expect(result.matches.map((m) => m.lineNumber)).toEqual([1]);
  });

  it("text 档 ignoreCase 为假（默认）时大小写敏感，不命中", () => {
    const result = grepLines(code, "IMPORT");
    expect(result.matches).toHaveLength(0);
    expect(result.totalMatches).toBe(0);
  });

  it("regex 档使用真正的 RegExp，通配符生效", () => {
    const result = grepLines(code, "^(import|export)", { mode: "regex" });
    expect(result.matches.map((m) => m.lineNumber)).toEqual([1, 4]);
  });

  it("regex 档 ignoreCase 映射为 i 标志", () => {
    const result = grepLines(code, "^IMPORT", { mode: "regex", ignoreCase: true });
    expect(result.matches.map((m) => m.lineNumber)).toEqual([1]);
  });

  it("regex 档非法模式报 INVALID_REQUEST", () => {
    try {
      grepLines(code, "(unterminated", { mode: "regex" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExternalAccessBridgeError);
      expect((e as ExternalAccessBridgeError).code).toBe("INVALID_REQUEST");
    }
  });

  it("contextLines 在文件首尾正确裁剪，相邻命中的上下文各自独立、允许重复", () => {
    const multi = ["l1", "l2 hit", "l3", "l4 hit", "l5"].join("\n");
    const result = grepLines(multi, "hit", { contextLines: 2 });
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]).toMatchObject({ lineNumber: 2, before: ["l1"], after: ["l3", "l4 hit"] });
    expect(result.matches[1]).toMatchObject({ lineNumber: 4, before: ["l2 hit", "l3"], after: ["l5"] });
  });

  it("contextLines 默认 0 时 before/after 为空数组", () => {
    const result = grepLines(code, "import");
    expect(result.matches[0].before).toEqual([]);
    expect(result.matches[0].after).toEqual([]);
  });

  it("maxMatches 截断命中数组但 totalMatches 仍是全部命中总数", () => {
    const many = Array.from({ length: 10 }, (_, i) => `hit ${i}`).join("\n");
    const result = grepLines(many, "hit", { maxMatches: 3 });
    expect(result.matches).toHaveLength(3);
    expect(result.totalMatches).toBe(10);
    expect(result.truncated).toBe(true);
  });

  it("未触发 maxMatches 截断时 truncated 为 false", () => {
    const result = grepLines(code, "import");
    expect(result.truncated).toBe(false);
  });

  it("超过单行长度上限（4096）的行被跳过匹配，计入 skippedLongLines", () => {
    const longLine = "x".repeat(MAX_GREP_LINE_LENGTH + 1) + "hit";
    const multi = ["hit here", longLine, "hit again"].join("\n");
    const result = grepLines(multi, "hit");
    expect(result.skippedLongLines).toBe(1);
    expect(result.matches.map((m) => m.lineNumber)).toEqual([1, 3]);
  });

  it("零命中返回空 matches 且 totalMatches 为 0", () => {
    const result = grepLines(code, "not-present-anywhere");
    expect(result.matches).toEqual([]);
    expect(result.totalMatches).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("query 为空串报 INVALID_REQUEST", () => {
    try {
      grepLines(code, "");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExternalAccessBridgeError);
      expect((e as ExternalAccessBridgeError).code).toBe("INVALID_REQUEST");
    }
  });

  it("query 超过 1024 字符报 INVALID_REQUEST", () => {
    try {
      grepLines(code, "x".repeat(1025));
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExternalAccessBridgeError);
      expect((e as ExternalAccessBridgeError).code).toBe("INVALID_REQUEST");
    }
  });

  it("contextLines 超过上限 10 报 INVALID_REQUEST（不静默截断）", () => {
    try {
      grepLines(code, "import", { contextLines: 11 });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExternalAccessBridgeError);
      expect((e as ExternalAccessBridgeError).code).toBe("INVALID_REQUEST");
    }
  });

  it("maxMatches 超过上限 200 报 INVALID_REQUEST（不静默截断）", () => {
    try {
      grepLines(code, "import", { maxMatches: 201 });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExternalAccessBridgeError);
      expect((e as ExternalAccessBridgeError).code).toBe("INVALID_REQUEST");
    }
  });

  it("maxMatches 为 NaN 或非整数报 INVALID_REQUEST，不静默吞掉全部命中", () => {
    // matches.length < NaN 恒为假：不拦住的话所有命中都进不了 matches，却仍报 totalMatches > 0
    // 与 truncated: true，调用方看到的是一份「命中被截断到 0 条」的结果。
    expect(() => grepLines(code, "import", { maxMatches: Number.NaN })).toThrow(ExternalAccessBridgeError);
    expect(() => grepLines(code, "import", { maxMatches: 2.5 })).toThrow(ExternalAccessBridgeError);
  });

  it("contextLines 为 NaN 或非整数报 INVALID_REQUEST，不绕过上下文行数上限", () => {
    // slice(Math.max(0, i - NaN), i) 等价于 slice(0, i)：命中行之前的**全部**行都会被当作上下文
    // 回传，远超 contextLines ≤ 10 的披露约定。
    const many = Array.from({ length: 40 }, (_, i) => (i === 30 ? "needle" : `line ${i}`)).join("\n");
    expect(() => grepLines(many, "needle", { contextLines: Number.NaN })).toThrow(ExternalAccessBridgeError);
    expect(() => grepLines(many, "needle", { contextLines: 1.5 })).toThrow(ExternalAccessBridgeError);
  });

  describe("正则执行预算（可注入时钟驱动，不依赖真实耗时）", () => {
    it("每 1000 行检查一次墙钟预算，超过 2000ms 中止并报 INVALID_REQUEST", () => {
      const manyLines = Array.from({ length: 2500 }, (_, i) => `line ${i}`).join("\n");
      let calls = 0;
      // 第一次调用是 startedAt 采样，返回 0；第二次调用发生在扫描满 1000 行的预算检查点，
      // 伪造成已经过去 2001ms——验证中止只依赖注入的时钟，不依赖真实耗时或真的写一个灾难性回溯模式。
      const clock = () => (calls++ === 0 ? 0 : 2001);
      try {
        grepLines(manyLines, "line", { mode: "regex" }, clock);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalAccessBridgeError);
        expect((e as ExternalAccessBridgeError).code).toBe("INVALID_REQUEST");
      }
      // 中止发生在第 1000 行检查点，第 2000 行检查点不应该被到达。
      expect(calls).toBe(2);
    });

    it("预算内完成时不受时钟调用次数影响，正常返回结果", () => {
      const fewLines = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
      const clock = () => 0; // 时钟恒定，"已耗时" 永远是 0，预算永不超支。
      const result = grepLines(fewLines, "line 10", { mode: "regex" }, clock);
      expect(result.matches).toHaveLength(1);
    });
  });
});
