/**
 * Converts a regex pattern string to a glob pattern using only '*' and '?'.
 * 将正则表达式字符串转换为仅使用 '*' 与 '?' 的 glob 模式。
 *
 * Rule / 规则：
 *   - '*' matches any string of any length (including empty)
 *     '*' 匹配任意长度（可为 0）的任意字符串
 *   - '?' matches exactly one character
 *     '?' 精确匹配单个字符
 *
 * Returns null if the regex syntax is invalid (e.g., unclosed groups, unclosed character classes, unterminated escapes).
 * 如果正则语法无效（如未闭合的括号/字符类、转义不完整），返回 null。
 *
 * @param reStr - The regex pattern string (e.g., '\\w+', 'https?:\\/\\/www\\.google\\.com\\/').
 * @returns The equivalent glob pattern using only '*' and '?' or null if the regex is invalid.
 *          返回等价的 glob 字符串，若无效则返回 null。
 *
 * Examples:
 * - '(a|b|c)' → '?'
 * - 'a.b.c' → 'a?b?c'
 * - '\\w*' → '*'
 * - '\\w+' → '?*'
 * - 'file\\.(js|ts)' → 'file.??'
 * - 'file\\.(js|ts|tsx)' → 'file.??*'
 * - 'file\\.(js|ts|tsx|\\w+)' → 'file.?*'
 * - 'file\\.(js|ts|tsx|\\w*)' → 'file.*'
 * - '\\d{3}-\\d{2}-\\d{4}' → '???-??-????'
 * - '[abc]' → '?'
 * - 'user_\\d{2,}' → 'user_??*'
 * - '.*' → '*'
 * - '(abc|def)' → '???'
 * - 'https?://www\\.google\\.com\\/' → 'http?://www.google.com/'
 * - 'https?:\\/\\/www\\.google\\.com\\/' → 'http?://www.google.com/'
 * - '[abc' → null
 * - '(ab' → null
 * - 'test\\' → null
 *
 * Notes / 注意：
 * - Output uses only '*' (zero or more chars, including empty) and '?' (exactly one char).
 *   输出仅使用 '*'（匹配零个或多个字符，包括空字符串）与 '?'（精确匹配一个字符）。
 * - Character classes (e.g., [abc], [^abc]) are approximated as '?'.
 *   字符类（如 [abc], [^abc]）近似处理为 '?'。
 * - Escaped characters (e.g., \\., \\/) are treated as literals (., /).
 *   转义字符（如 \\., \\/）被视为字面量（., /）。
 * - Complex regex features (e.g., lookaheads, nested groups) are approximated as '*' or '?' based on minimum length.
 *   复杂正则特性（如前瞻、嵌套分组）根据最小匹配长度近似为 '*' 或 '?'。
 * - Invalid regex syntax (e.g., unclosed groups, unclosed brackets, unterminated escapes) returns null.
 *   无效的正则语法（如未闭合的分组、未闭合的括号、转义符未结束）将返回 null。
 */

export function regexToGlob(reStr: string): string | null {
  let i: number = 0; // Current cursor in input / 输入游标位置
  const n: number = reStr.length; // Input length / 输入长度
  const out: string[] = []; // Accumulated glob pieces / 结果片段累积

  // Set of regex special chars used to detect literals vs operators
  // 正则特殊字符集合，用于区分字面量与操作符
  const REGEX_SPECIAL: Set<string> = new Set([".", "^", "$", "|", "(", ")", "[", "]", "{", "}", "?", "+", "*", "\\"]);

  // Escape '*' and '?' when they should be literal in the output glob.
  // 如果输出中需要字面量 '*' 或 '?'，这里加反斜杠转义。
  function escapeGlobLiteral(ch: string): string {
    return ch === "*" || ch === "?" ? "\\" + ch : ch;
  }

  // Look ahead / 取当前字符（不前进）
  function peek(): string {
    return reStr[i] || "";
  }
  // Consume current char / 取当前字符并前进
  function next(): string {
    return reStr[i++] || "";
  }
  // If next is ch, consume it and return true; else false
  // 若下一个字符为 ch，则消费并返回 true，否则返回 false
  function eatIf(ch: string): boolean {
    if (peek() === ch) {
      i++;
      return true;
    }
    return false;
  }

  // Interface for parsed unit
  interface Unit {
    glob: string;
    baseGlob: string;
    canRepeat: boolean;
    min: number;
    isLiteral: boolean;
    varLen: boolean;
  }

  // ----- Character class ----- 字符类解析 -----
  // Parses things like [abc], [^0-9]. Always approximated to '?' (one char).
  // 解析形如 [abc] / [^0-9]，在 glob 中统一近似为 '?'（匹配一个字符）
  function parseCharClass(): Unit | null {
    eatIf("^"); // Optional leading ^ for negation / 可选的取反标记
    let closed: boolean = false;
    while (i < n) {
      const ch: string = next();
      if (ch === "\\") {
        // Escaped char inside class / 类内转义
        if (!next()) return null; // Unterminated escape / 转义不完整
      } else if (ch === "]") {
        // End of class / 字符类结束
        closed = true;
        break;
      }
    }
    if (!closed) return null; // Unclosed class / 未闭合
    // Return a normalized unit description for downstream handling
    // 返回标准化的“单元”描述，方便后续统一处理
    return { glob: "?", baseGlob: "?", canRepeat: true, min: 1, isLiteral: false, varLen: false };
  }

  // ----- Literal utils ----- 字面量辅助 -----

  // If s is a pure literal (with valid escapes), return its fixed length; else -1.
  // 判断 s 是否为纯字面量（且转义合法），若是返回固定长度，否则返回 -1
  function fixedLiteralLength(s: string): number {
    let len: number = 0;
    for (let k = 0; k < s.length; k++) {
      if (s[k] === "\\") {
        k++;
        if (k >= s.length) return -1; // Bad escape / 非法转义
        len += 1;
      } else if (REGEX_SPECIAL.has(s[k])) {
        return -1; // Contains special / 含有特殊字符
      } else {
        len += 1;
      }
    }
    return len;
  }

  // Unescape a literal-only regex fragment into a glob-safe literal.
  // 将仅含字面量的正则片段解转义，并确保在 glob 中安全（转义 * 和 ?）
  function unescapeRegexLiteral(s: string): string | null {
    let out: string = "";
    for (let k = 0; k < s.length; k++) {
      let ch: string = s[k];
      if (ch === "\\") {
        k++;
        if (k >= s.length) return null; // Bad escape / 非法转义
        ch = s[k];
      } else if (REGEX_SPECIAL.has(ch)) {
        return null; // 非纯字面量
      }
      out += escapeGlobLiteral(ch);
    }
    return out;
  }

  // ----- Simple sequence analysis ----- 简单序列分析
  // The helpers below conservatively compute minimum matched length and variability.
  // 下列函数保守估算一个片段的最小匹配长度及是否可变长。

  // Parse a [...] inside a string (no full parser; just to skip correctly).
  // 在字符串中识别并跳过一个字符类 [...]，用于最小长度分析
  function parseClassInString(s: string, idx: number): number {
    idx++;
    if (idx < s.length && s[idx] === "^") idx++;
    while (idx < s.length) {
      const ch: string = s[idx++];
      if (ch === "\\") {
        if (idx >= s.length) return -1; // Bad escape / 非法转义
        idx++;
      } else if (ch === "]") {
        return idx; // End of class / 类结束
      }
    }
    return -1; // Unclosed / 未闭合
  }

  // Parse a {m}, {m,}, {m,n} quantifier in a string.
  // 在字符串中解析 {m}、{m,}、{m,n} 数量词
  interface QuantifierResult {
    ok: boolean;
    next: number;
    type?: "exact" | "open" | "range";
    m?: number;
    nmax?: number;
  }

  function parseBracesQuant(s: string, idx: number): QuantifierResult {
    const start: number = idx;
    idx++;
    let num: string = "";
    while (idx < s.length && /[0-9]/.test(s[idx])) num += s[idx++];
    if (num === "" || idx >= s.length) return { ok: false, next: start };
    const m: number = parseInt(num, 10);

    if (s[idx] === "}") {
      idx++;
      if (idx < s.length && s[idx] === "?") idx++; // Ignore laziness
      return { ok: true, next: idx, type: "exact", m };
    }
    if (s[idx] === ",") {
      idx++;
      let num2: string = "";
      while (idx < s.length && /[0-9]/.test(s[idx])) num2 += s[idx++];
      if (idx >= s.length || s[idx] !== "}") return { ok: false, next: start };
      idx++;
      if (idx < s.length && s[idx] === "?") idx++;
      if (num2 === "") return { ok: true, next: idx, type: "open", m }; // {m,}
      const nmax: number = parseInt(num2, 10);
      return { ok: true, next: idx, type: "range", m, nmax }; // {m,n}
    }
    return { ok: false, next: start };
  }

  // Analyze a sequence without nested groups/alternations; compute min length & variable flag.
  // 分析“不含嵌套分组/交替”的简单序列；计算最小长度与是否可变长
  interface SequenceAnalysis {
    base: string;
    min: number;
    varLen: boolean;
  }

  function analyzeSimpleSequence(s: string): SequenceAnalysis | null {
    let idx: number = 0,
      minTotal: number = 0,
      variable: boolean = false;

    while (idx < s.length) {
      let unitMin: number = 0,
        unitVar: boolean = false;
      const ch: string = s[idx];

      if (ch === "(") return null; // Nested group detected -> not simple
      // 发现嵌套分组，视为复杂，放弃简单分析
      if (ch === "\\") {
        idx++;
        if (idx >= s.length) return null;
        const esc: string = s[idx++];
        // \b, \B are zero-width boundaries => min 0
        // \b 和 \B 为零宽断言 => 最小长度 0
        if (esc === "b" || esc === "B") {
          unitMin = 0;
          unitVar = false;
        }
        // \w, \d, \s (and uppercase variants) match one char
        // \w, \d, \s 及其大写变体匹配单字符
        else if ("wdsWDS".includes(esc)) {
          unitMin = 1;
          unitVar = false;
        } else {
          unitMin = 1;
          unitVar = false;
        } // Other escapes treated as literal 其他转义按字面量处理
      } else if (ch === ".") {
        idx++;
        unitMin = 1;
        unitVar = false; // Dot = any single char / 点匹配单字符
      } else if (ch === "[") {
        const ni: number = parseClassInString(s, idx);
        if (ni < 0) return null; // Invalid class / 非法字符类
        idx = ni;
        unitMin = 1;
        unitVar = false;
      } else if (REGEX_SPECIAL.has(ch)) {
        return null; // Special op => bail 出现运算符，放弃简单分析
      } else {
        idx++;
        unitMin = 1;
        unitVar = false; // Plain literal 字面量
      }

      // Quantifier handling / 处理数量词
      if (idx < s.length) {
        const q: string = s[idx];
        if (q === "*") {
          // * => min 0, variable
          idx++;
          if (idx < s.length && s[idx] === "?") idx++;
          unitMin = 0;
          unitVar = true;
        } else if (q === "+") {
          // + => at least one
          idx++;
          if (idx < s.length && s[idx] === "?") idx++;
          unitMin = Math.max(1, unitMin);
          unitVar = true;
        } else if (q === "?") {
          // ? => optional
          idx++;
          if (idx < s.length && s[idx] === "?") idx++;
          unitMin = 0;
          unitVar = true;
        } else if (q === "{") {
          // {m}, {m,}, {m,n}
          const br: QuantifierResult = parseBracesQuant(s, idx);
          if (!br.ok) return null;
          idx = br.next;
          if (br.type === "exact") unitMin = unitMin * (br.m || 0);
          else if (br.type === "open") {
            unitMin = unitMin * (br.m || 0);
            unitVar = true;
          } else {
            unitMin = unitMin * (br.m || 0);
            if (br.nmax && br.nmax > (br.m || 0)) unitVar = true;
          }
        }
      }

      minTotal += unitMin;
      variable = variable || unitVar;
    }

    // base: minimum number of '?' required by this sequence
    // base：该序列最少需要的 '?' 数量
    return { base: "?".repeat(minTotal), min: minTotal, varLen: variable };
  }

  // ----- Group parsing (alternations, lookaheads, etc.) -----
  // 分组解析（交替 |、前瞻等）
  function parseGroup(): Unit | null {
    const parts: string[] = [];
    let depth: number = 1,
      buf: string = "",
      isAlt: boolean = false;

    // Group prefix like (?:...), (?=...), (?!...)
    // 分组前缀处理：非捕获、前瞻等
    if (peek() === "?") {
      next();
      const kind: string = next(); // could be ':', '=', '!', '<', etc.
      if (kind === ":") {
        // Non-capturing group: proceed normally
        // 非捕获分组：正常继续解析
      } else if (kind === "=" || kind === "!") {
        // LOOKAHEAD (?=...) or (?!...) — zero-width: consume and emit nothing
        // Lookahead: zero-width => contributes no chars to glob
        // 前瞻为零宽断言，对 glob 不贡献字符，只需跳过内容
        let laDepth: number = 1;
        while (i < n && laDepth > 0) {
          const ch2: string = next();
          if (ch2 === "\\") {
            if (!next()) return null;
          } else if (ch2 === "(") laDepth++;
          else if (ch2 === ")") laDepth--;
        }
        if (laDepth !== 0) return null; // Unclosed group / 未闭合
        return { glob: "", baseGlob: "", canRepeat: false, min: 0, isLiteral: false, varLen: false };
      } else if (kind === "<") {
        // LOOKBEHIND (?<=...) or (?<!...) — zero-width: consume and emit nothing
        const lb = next(); // '=' or '!' expected
        if (lb === "=" || lb === "!") {
          let lbDepth = 1;
          while (i < n && lbDepth > 0) {
            const ch2 = next();
            if (ch2 === "\\") {
              if (!next()) return null;
            } else if (ch2 === "(") lbDepth++;
            else if (ch2 === ")") lbDepth--;
          }
          if (lbDepth !== 0) return null; // unclosed
          return { glob: "", baseGlob: "", canRepeat: false, min: 0, isLiteral: false, varLen: false };
        } else {
          // unknown (?<x...) extension: treat best-effort (put chars back into buffer)
          // We already consumed '<' and one char; keep them in buf so the parser
          // can fall back appropriately.
          buf += "<" + lb;
        }
      } else {
        // Unknown (?x) — treat 'x' as literal content of group head (include the char back)
        // 未知前缀（?x），保守地将其加入缓冲
        buf += kind;
      }
    }

    // Parse until the matching ')', tracking alternations at depth 1
    // 解析到匹配的 ')'，在最外层深度跟踪 '|' 以拆分交替分支
    while (i < n && depth > 0) {
      const ch: string = next();
      if (ch === "\\") {
        const esc: string = next();
        if (!esc) return null;
        // Keep escapes as-is unless they are known specials
        // 保留转义（若非特殊字符则继续作为转义）
        buf += REGEX_SPECIAL.has(esc) ? esc : "\\" + esc;
      } else if (ch === "(") {
        depth++;
        buf += ch;
      } else if (ch === ")") {
        depth--;
        if (depth === 0) break;
        buf += ch;
      } else if (ch === "|" && depth === 1) {
        isAlt = true;
        parts.push(buf);
        buf = "";
      } else {
        buf += ch;
      }
    }
    if (depth > 0) return null; // Unclosed group / 分组未闭合
    if (buf) parts.push(buf);

    if (isAlt) {
      // Case 1: all arms are pure literals => base length = min, add '*' if lengths differ
      // 情况1：所有分支均为纯字面量 => 取最小长度为基，若长度不同则追加 '*'
      const lens: number[] = parts.map(fixedLiteralLength);
      if (lens.every((x) => x >= 0)) {
        const minLen: number = Math.min(...lens);
        const maxLen: number = Math.max(...lens);
        const base: string = "?".repeat(minLen);
        return {
          glob: base + (maxLen > minLen ? "*" : ""),
          baseGlob: base,
          canRepeat: true,
          min: minLen,
          isLiteral: false,
          varLen: maxLen > minLen,
        };
      }
      // Case 2: analyze each arm as a simple sequence (e.g., 'uuid-\\d+')
      // 情况2：对每个分支做简单序列分析（如 'uuid-\\d+'）
      const analyzed: (SequenceAnalysis | null)[] = parts.map(analyzeSimpleSequence);
      if (analyzed.every((x) => x)) {
        const mins: number[] = analyzed.map((x) => x!.min);
        const minLen: number = Math.min(...mins);
        const variable: boolean = analyzed.some((x) => x!.varLen) || new Set(mins).size > 1;
        const base: string = "?".repeat(minLen);
        return {
          glob: base + (variable ? "*" : ""),
          baseGlob: base,
          canRepeat: true,
          min: minLen,
          isLiteral: false,
          varLen: variable,
        };
      }
      // Fallback: unknown/complex alternation => '*'
      // 兜底：复杂交替无法分析 => 使用 '*'
      return { glob: "*", baseGlob: "*", canRepeat: true, min: 0, isLiteral: false, varLen: true };
    }

    // Non-alternation group: try literal first, then simple sequence; else fallback '*'
    // 非交替分组：先尝试纯字面量，再尝试简单序列；否则回退 '*'
    const literal: string | null = unescapeRegexLiteral(parts[0] ?? "");
    if (literal != null) {
      return { glob: literal, baseGlob: literal, canRepeat: true, min: literal.length, isLiteral: true, varLen: false };
    }
    const seq: SequenceAnalysis | null = analyzeSimpleSequence(parts[0] ?? "");
    if (seq) {
      return {
        glob: seq.base + (seq.varLen ? "*" : ""),
        baseGlob: seq.base,
        canRepeat: true,
        min: seq.min,
        isLiteral: false,
        varLen: seq.varLen,
      };
    }
    return { glob: "*", baseGlob: "*", canRepeat: true, min: 0, isLiteral: false, varLen: true };
  }

  // ----- Unit parsing ----- 单元解析
  // One unit may be: escaped token, '.', class, group, anchors, or literal char.
  // 单元可为：转义、点、字符类、分组、锚点、或普通字面量。
  function parseUnit(): Unit | null {
    const ch: string = next();

    if (ch === "\\") {
      const esc: string = next();
      if (!esc) return null; // Unterminated escape / 转义不完整
      if (esc === "b" || esc === "B")
        return { glob: "", baseGlob: "", canRepeat: false, min: 0, isLiteral: false, varLen: false }; // word boundary
      if ("wdsWDS".includes(esc))
        return { glob: "?", baseGlob: "?", canRepeat: true, min: 1, isLiteral: false, varLen: false }; // class-like escapes
      const lit: string = escapeGlobLiteral(esc); // other escapes => literal char
      return { glob: lit, baseGlob: lit, canRepeat: true, min: 1, isLiteral: true, varLen: false };
    }

    if (ch === ".") return { glob: "?", baseGlob: "?", canRepeat: true, min: 1, isLiteral: false, varLen: false };
    if (ch === "[") return parseCharClass();
    if (ch === "(") return parseGroup();
    if (ch === "^" || ch === "$")
      return { glob: "", baseGlob: "", canRepeat: false, min: 0, isLiteral: false, varLen: false }; // anchors are zero-width / 锚点零宽

    // Plain literal character
    // 普通字面量字符
    const lit: string = escapeGlobLiteral(ch);
    return { glob: lit, baseGlob: lit, canRepeat: true, min: 1, isLiteral: true, varLen: false };
  }

  // ----- Quantifiers ----- 数量词应用
  // Map regex quantifiers (* + ? {m,n}) to glob pieces using the unit's base info.
  // 将正则数量词（* + ? {m,n}）映射到 glob 片段，使用单元的基信息（baseGlob、min、varLen）
  function applyQuantifier(unit: Unit | null): string | null {
    if (unit === null) return null;

    // '*' or '*?' => any length (including empty)
    // '*' 或 '*?' => 任意长度（含空）
    if (peek() === "*") {
      next();
      if (peek() === "?") next();
      return "*";
    }

    // '+' or '+?' => at least one occurrence; translate to base + '*'
    // '+' 或 '+?' => 至少一次；转换为 base + '*'
    if (peek() === "+") {
      next();
      if (peek() === "?") next();
      return (unit.baseGlob || unit.glob) + "*";
    }

    // '?' or '??' => optional one unit; if unit is exactly one char, keep '?', else '*'
    // '?' 或 '??' => 可选；若单元为恰一字符则用 '?'，否则用 '*' 近似
    if (peek() === "?") {
      next();
      if (peek() === "?") next();
      return "*";
    }

    // '{m}', '{m,}', '{m,n}'
    // 精确/范围数量词
    if (peek() === "{") {
      const save: number = i;
      next();
      let num: string = "";
      while (/[0-9]/.test(peek())) num += next();
      if (num === "" || (peek() !== "}" && peek() !== ",")) {
        i = save;
        return unit.glob;
      }
      const m: number = parseInt(num, 10);

      if (eatIf("}")) {
        if (peek() === "?") next();
        return (unit.baseGlob || unit.glob).repeat(m);
      }
      if (eatIf(",")) {
        let num2: string = "";
        while (/[0-9]/.test(peek())) num2 += next();
        if (!eatIf("}")) {
          i = save;
          return unit.glob;
        }
        const core: string = (unit.baseGlob || unit.glob).repeat(m);
        if (peek() === "?") next();
        if (num2 === "") return core + "*"; // {m,}
        const nmax: number = parseInt(num2, 10);
        return core + (Number.isNaN(nmax) || nmax > m ? "*" : ""); // {m,n}（若 n>m 则可变长）
      }
    }

    // No quantifier: return original glob of the unit
    // 无数量词：返回单元原始 glob
    return unit.glob;
  }

  // ----- Main ----- 主流程
  while (i < n) {
    const unit: Unit | null = parseUnit();
    if (unit === null) return null; // Syntax error / 语法错误
    const piece: string | null = applyQuantifier(unit);
    if (piece === null) return null; // Quantifier error / 数量词错误
    out.push(piece);
  }

  // Canonicalize runs of '*' and '?' (e.g., "*?*" -> "?*")
  // 规范化连续的 '*' 与 '?'（如 "*?*" 归一为 "?*"），避免冗余
  let glob: string = out.join("");
  glob = glob.replace(/(?<!\\)(?:\*|\?)+/g, (m: string): string => {
    const q: number = (m.match(/\?/g) || []).length;
    const hasStar: boolean = m.indexOf("*") !== -1;
    if (!hasStar) return "?".repeat(q);
    if (q === 0) return "*";
    if (q === 1) return "?*";
    return "?".repeat(q) + "*";
  });

  return glob;
}
