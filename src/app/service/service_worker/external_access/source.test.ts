import { describe, it, expect } from "vitest";
import { sliceLines, grepLines, applyTextEdits } from "./source";
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

  it("regex 档如实搜索超长行，不跳过匹配", () => {
    const longLine = "x".repeat(5000) + "hit";
    const multi = ["hit here", longLine, "hit again"].join("\n");
    const result = grepLines(multi, "hit", { mode: "regex" });
    expect(result.skippedLongLines).toBe(0);
    expect(result.matches.map((m) => m.lineNumber)).toEqual([1, 2, 3]);
    expect(result.matches[1].line).toBe(longLine);
  });

  it("text 档不跳过超长行：命中原样返回、不截断，skippedLongLines 恒为 0", () => {
    // 压缩/打包后的用户脚本常整份代码挤在一行；text 档若跳过长行，字面量搜索对这类脚本永远零命中。
    const longLine = "x".repeat(5000) + "hit";
    const result = grepLines(longLine, "hit");
    expect(result.skippedLongLines).toBe(0);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].line).toBe(longLine);
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

  it("query 长度不设独立上限，由 WebSocket frame 边界统一约束", () => {
    expect(grepLines(`${"x".repeat(2048)} needle`, `${"x".repeat(2048)} needle`).totalMatches).toBe(1);
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

// 断言抛出的是 INVALID_REQUEST 并把错误交回调用方，供「未找到」与「不唯一」两种消息的区分断言。
function expectInvalidRequest(fn: () => unknown): ExternalAccessBridgeError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ExternalAccessBridgeError);
    expect((e as ExternalAccessBridgeError).code).toBe("INVALID_REQUEST");
    return e as ExternalAccessBridgeError;
  }
  return expect.unreachable("should have thrown");
}

describe("applyTextEdits（scripts.edit.request 的内容锚定编辑）", () => {
  const code = ["function login() {", "  return fetch('/api/login');", "}"].join("\n");

  it("oldText 恰好命中一次时只替换该处，其余文本逐字节不变", () => {
    expect(applyTextEdits(code, [{ oldText: "'/api/login'", newText: "'/api/v2/login'" }])).toBe(
      ["function login() {", "  return fetch('/api/v2/login');", "}"].join("\n")
    );
  });

  it("oldText 未命中时报 INVALID_REQUEST，消息说明未找到", () => {
    const error = expectInvalidRequest(() => applyTextEdits(code, [{ oldText: "logout", newText: "x" }]));
    expect(error.message).toContain("not found");
  });

  it("oldText 命中多处且未开 replaceAll 时报 INVALID_REQUEST，消息与「未找到」可区分并提示补充上下文", () => {
    const error = expectInvalidRequest(() => applyTextEdits("a\nb\na", [{ oldText: "a", newText: "c" }]));
    expect(error.message).not.toContain("not found");
    expect(error.message).toContain("not unique");
  });

  it("replaceAll 为真时多处命中全部替换", () => {
    expect(applyTextEdits("a\nb\na", [{ oldText: "a", newText: "c", replaceAll: true }])).toBe("c\nb\nc");
  });

  it("多个 edit 顺序应用：后一个作用于前一个的结果，而非原始快照", () => {
    // 并行作用于原始快照的实现会在第二个 edit 上找不到 "b"（原文里没有）而报错。
    expect(
      applyTextEdits("a", [
        { oldText: "a", newText: "b" },
        { oldText: "b", newText: "c" },
      ])
    ).toBe("c");
  });

  it("唯一性按前一个 edit 的结果逐步重新校验：前一步制造出第二处命中即判为不唯一", () => {
    const error = expectInvalidRequest(() =>
      applyTextEdits("A\nB", [
        { oldText: "A", newText: "B" },
        { oldText: "B", newText: "C" },
      ])
    );
    expect(error.message).toContain("not unique");
  });

  it("newText 为空串即删除命中的片段", () => {
    expect(applyTextEdits("keep\ndrop me\nkeep2", [{ oldText: "\ndrop me", newText: "" }])).toBe("keep\nkeep2");
  });

  it("newText 里的 $& / $1 / $$ 按字面插入，不做替换模式展开", () => {
    // String.prototype.replace(All) 即便 pattern 是字符串也仍会展开 $& 等替换模式，而 "$&" 在用户
    // 脚本里是合法字面量——展开会静默写入与请求不同的代码。
    expect(applyTextEdits("cost = 1", [{ oldText: "1", newText: "$& + $1 + $$" }])).toBe("cost = $& + $1 + $$");
  });

  it("oldText 为空串报 INVALID_REQUEST（空锚点在任意位置都成立，无法定位）", () => {
    expectInvalidRequest(() => applyTextEdits(code, [{ oldText: "", newText: "x" }]));
  });

  it("全部 edit 应用后与原文逐字节相同时报 INVALID_REQUEST，不为空改动开确认页", () => {
    expectInvalidRequest(() => applyTextEdits(code, [{ oldText: "login", newText: "login", replaceAll: true }]));
    expectInvalidRequest(() =>
      applyTextEdits("a", [
        { oldText: "a", newText: "b" },
        { oldText: "b", newText: "a" },
      ])
    );
  });

  it("自重叠的 oldText 按候选位置计数，不因非重叠推进而漏算成唯一命中", () => {
    // "aa" 在 "aaa" 里下标 0 和 1 各成立一次。按非重叠推进只会数出 1 次，于是「恰好命中一次」
    // 的保证静默失效、直接改掉第一处——正是内容锚定要杜绝的「悄悄改错地方」。
    const error = expectInvalidRequest(() => applyTextEdits("aaa", [{ oldText: "aa", newText: "X" }]));
    expect(error.message).toContain("not unique");
    expect(error.message).toContain("2");
  });

  it("空行块、连续缩进这类自重叠锚点同样按候选位置计数", () => {
    expectInvalidRequest(() => applyTextEdits("a\n\n\nb", [{ oldText: "\n\n", newText: "\n" }]));
    expectInvalidRequest(() => applyTextEdits("x(((y", [{ oldText: "((", newText: "(" }]));
  });

  it("edits 条数不设独立上限，仍受请求 frame 与执行预算约束", () => {
    const name = (i: number) => `line${String(i).padStart(3, "0")}`;
    const many = Array.from({ length: 101 }, (_, i) => name(i)).join("\n");
    const edits = Array.from({ length: 101 }, (_, i) => ({
      oldText: name(i),
      newText: name(i).toUpperCase(),
    }));
    expect(applyTextEdits(many, edits)).toBe(edits.map((e) => e.newText).join("\n"));
  });

  it("应用耗时超出墙钟预算时中止，不把 service worker 拖在同步循环里", () => {
    // 时钟每读一次跳一次：首读为 0 记起点，之后即超预算。用可注入时钟而非真等，测试才不依赖机器快慢。
    let calls = 0;
    const clock = () => (calls++ === 0 ? 0 : 2001);
    const error = expectInvalidRequest(() =>
      applyTextEdits(
        "a\nb\nc",
        [
          { oldText: "a", newText: "x" },
          { oldText: "b", newText: "y" },
        ],
        clock
      )
    );
    expect(error.message).toContain("too slow");
  });

  it("预算未超支时不影响正常的多条编辑", () => {
    const clock = () => 0; // 时钟恒定，"已耗时" 永远是 0，预算永不超支。
    expect(
      applyTextEdits(
        "a\nb",
        [
          { oldText: "a", newText: "x" },
          { oldText: "b", newText: "y" },
        ],
        clock
      )
    ).toBe("x\ny");
  });
});
