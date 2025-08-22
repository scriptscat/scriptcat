/**
 * Converts a regex pattern string to a glob pattern using only '*' and '?'.
 * 将正则表达式字符串转换为仅使用 '*' 与 '?' 的 glob 模式。
 *
 * Rule / 规则：
 *   - '*' matches any string of any length (including empty)
 *     '*' 匹配任意长度（可为 0）的任意字符串
 *   - '?' matches exactly one character
 *     '?' 精确匹配单个字符
 *   - In the resulting glob, every character other than '*' and '?' is a literal; there is no escape mechanism.
 *     在生成的 glob 模式中，除 '*' 与 '?' 之外的所有字符均作为字面量处理；不支持转义字符。
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
 * - 'file\\.(js|ts)' → 'file.?s'
 * - 'file\\.(js|ts|tsx)' → 'file.??*'
 * - 'file\\.(js|ts|tsx|\\w+)' → 'file.?*'
 * - 'file\\.(js|ts|tsx|\\w*)' → 'file.*'
 * - '\\d{3}-\\d{2}-\\d{4}' → '???-??-????'
 * - '[abc]' → '?'
 * - 'user_\\d{2,}' → 'user_??*'
 * - '.*' → '*'
 * - '(abc|def)' → '???'
 * - '^(http|https?):\\/\\/www\\.google\\.com' → 'http*://www.google.com'
 * - 'https?://www.google.com/search\\?q=\\w+&page=\\d+' → 'http*://www?google?com/search?q=?*&page=?*'
 * - 'te(st){5,}' → 'teststststst*'
 * - 'te(st){5,8}' → 'teststststst*'
 * - '(?:(?=x)ab|cd(?!y))' → '??'
 * - '(ab(cd|ef(gh|i)))' → 'ab?*'
 * - 'a+?' → 'a*', 'a??' → '*', 'a{2,}?' → 'aa*', 'a{3}?' → 'aaa', 'a{2,5}?' → 'aa*'
 * - 'a*+' → '*', 'a++' → 'a*', 'a?+' → '*', 'a{2,}+' → 'aa*', 'a{3}+' → 'aaa', 'a{2,5}+' → 'aa*'
 * - '\\?' → '?'   // literal '?' approximated as single-char match
 * - '\\*' → '?'   // literal '*' approximated as single-char match
 * - '[abc' → null
 * - 'abc]' → null
 * - '(ab' → null
 * - 'ab)' → null
 * - 'test\\' → null
 * - malformed braces fall back as literals: 'a{', 'a{2,', 'a{,3}', 'a{}', 'a{,}' 等 → 原样字面量
 *
 * Notes / 注意：
 * - Output uses only '*'（>=0 chars）and '?'（exactly 1 char）.
 *   输出仅使用 '*'（≥0 个字符）与 '?'（恰 1 个字符）。
 * - Character classes (e.g., [abc], [^abc]) are approximated as '?'.
 *   字符类近似处理为 '?'。
 * - Escaped specials (e.g., \\., \\/) are treated as literals (., /).
 *   转义特殊符号（如 \\., \\/）按字面量输出（.、/）。
 * - Escaped glob-reserved chars (\\?, \\*) are mapped to '?' (single-char) since literal '?'/'*' cannot be represented in a pure '*'/'?' glob.
 *   对于 glob 保留字符（\\?, \\*），输出统一为 '?'（单字符近似），因纯 '*'/'?' 的 glob 无法表达其字面量。
 * - Lazy / possessive modifiers ('?','+') on quantifiers behave the same as greedy in glob.
 *   懒惰/占有量词修饰（'?','+'）在 glob 中与贪婪等价处理。
 * - Alternations extract common prefix/suffix; nested groups are summarized recursively.
 *   交替分支提取公共前/后缀；嵌套分组递归汇总。
 */

export function regexToGlob(reStr: string): string | null {
  let i: number = 0; // Current cursor in input / 输入游标位置
  const n: number = reStr.length; // Input length / 输入长度
  const out: string[] = []; // Accumulated glob pieces / 结果片段累积

  // Set of regex special chars used to detect literals vs operators
  // 正则特殊字符集合，用于区分字面量与操作符
  const REGEX_SPECIAL: Set<string> = new Set([".", "^", "$", "|", "(", ")", "[", "]", "{", "}", "?", "+", "*", "\\"]);

  // Map escaped chars into safe glob literal output.
  // 将转义字符映射为可安全输出到 glob 的字面量：
  // - '\\*' / '\\?' → '?'（单字符近似）
  // - others → 原字符（如 '.'、'/'）
  function escapeGlobLiteral(ch: string): string {
    if (ch === "*" || ch === "?") return "?"; // cannot be literal in pure glob; approximate as one char
    return ch;
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

  // 量词修饰：懒惰/占有 '?','+' —— 在 glob 中等价，统一忽略
  function eatQuantMod(): void {
    if (peek() === "?" || peek() === "+") next();
  }

  // Interface for parsed unit
  // 单元接口
  interface Unit {
    glob: string;
    baseGlob: string;
    canRepeat: boolean;
    min: number;
    isLiteral: boolean;
    varLen: boolean;
  }

  // ----- Helpers for common prefix/suffix on literal arms -----
  // 公共前后缀
  function lcp(strs: string[]): string {
    if (strs.length === 0) return "";
    let p = strs[0];
    for (const s of strs.slice(1)) {
      let k = 0;
      const m = Math.min(p.length, s.length);
      while (k < m && p[k] === s[k]) k++;
      p = p.slice(0, k);
      if (!p) break;
    }
    return p;
  }
  function lcs(strs: string[]): string {
    if (strs.length === 0) return "";
    const rev = strs.map((s) => [...s].reverse().join(""));
    const r = lcp(rev);
    return [...r].reverse().join("");
  }
  function isEscaped(s: string, idx: number): boolean {
    let k = idx - 1,
      cnt = 0;
    while (k >= 0 && s[k] === "\\") {
      cnt++;
      k--;
    }
    return cnt % 2 === 1;
  }

  // 提取字面头/尾（解转义）及其源长度
  function literalHeadInfo(s: string): { lit: string; srcLen: number } {
    let idx = 0,
      outL = "";
    while (idx < s.length) {
      const ch = s[idx];
      if (ch === "\\") {
        if (idx + 1 >= s.length) break;
        outL += escapeGlobLiteral(s[idx + 1]);
        idx += 2;
      } else if (REGEX_SPECIAL.has(ch)) {
        break;
      } else {
        outL += escapeGlobLiteral(ch);
        idx++;
      }
    }
    return { lit: outL, srcLen: idx };
  }
  function literalTailInfo(s: string): { lit: string; srcLen: number } {
    let idx = s.length - 1,
      outL = "",
      src = 0;
    while (idx >= 0) {
      const ch = s[idx];
      if (isEscaped(s, idx)) {
        outL = escapeGlobLiteral(ch) + outL;
        src += 2;
        idx -= 2;
      } else if (REGEX_SPECIAL.has(ch)) {
        break;
      } else {
        outL = escapeGlobLiteral(ch) + outL;
        src += 1;
        idx -= 1;
      }
    }
    return { lit: outL, srcLen: src };
  }
  function headSrcLenFor(s: string, need: string): number {
    if (!need) return 0;
    let idx = 0,
      got = "";
    while (idx < s.length && got.length < need.length) {
      const ch = s[idx];
      if (ch === "\\") {
        if (idx + 1 >= s.length) break;
        got += escapeGlobLiteral(s[idx + 1]);
        idx += 2;
      } else if (REGEX_SPECIAL.has(ch)) {
        break;
      } else {
        got += escapeGlobLiteral(ch);
        idx += 1;
      }
    }
    return got.startsWith(need) ? idx : 0;
  }
  function tailSrcLenFor(s: string, need: string): number {
    if (!need) return 0;
    let idx = s.length - 1,
      got = "";
    while (idx >= 0 && got.length < need.length) {
      const ch = s[idx];
      if (isEscaped(s, idx)) {
        got = escapeGlobLiteral(ch) + got;
        idx -= 2;
      } else if (REGEX_SPECIAL.has(ch)) {
        break;
      } else {
        got = escapeGlobLiteral(ch) + got;
        idx -= 1;
      }
    }
    return got.endsWith(need) ? s.length - 1 - idx : 0;
  }

  // ----- Character class ----- 字符类解析 -----
  function parseCharClass(): Unit | null {
    if (peek() === "^") next(); // 可选取反
    let closed = false,
      first = true;
    while (i < n) {
      const ch = next();
      if (ch === "\\" && i < n) {
        if (!next()) return null;
      } else if (ch === "]" && !first) {
        closed = true;
        break;
      }
      first = false;
    }
    if (!closed) return null;
    return { glob: "?", baseGlob: "?", canRepeat: true, min: 1, isLiteral: false, varLen: false };
  }

  // ----- Literal utils ----- 字面量辅助 -----
  function fixedLiteralLength(s: string): number {
    let len = 0;
    for (let k = 0; k < s.length; k++) {
      if (s[k] === "\\") {
        k++;
        if (k >= s.length) return -1;
        len += 1;
      } else if (REGEX_SPECIAL.has(s[k])) {
        return -1;
      } else {
        len += 1;
      }
    }
    return len;
  }
  function unescapeRegexLiteral(s: string): string | null {
    let outS = "";
    for (let k = 0; k < s.length; k++) {
      let ch = s[k];
      if (ch === "\\") {
        k++;
        if (k >= s.length) return null;
        ch = s[k];
      } else if (REGEX_SPECIAL.has(ch)) {
        return null;
      }
      outS += escapeGlobLiteral(ch);
    }
    return outS;
  }

  // ----- Simple sequence analysis ----- 简单序列分析
  function parseClassInString(s: string, idx: number): number {
    idx++;
    if (idx < s.length && s[idx] === "^") idx++;
    let first = true;
    while (idx < s.length) {
      const ch = s[idx++];
      if (ch === "\\") {
        if (idx >= s.length) return -1;
        idx++;
      } else if (ch === "]" && !first) {
        return idx;
      }
      first = false;
    }
    return -1;
  }

  interface QuantifierResult {
    ok: boolean;
    next: number;
    type?: "exact" | "open" | "range";
    m?: number;
    nmax?: number;
  }
  function parseBracesQuant(s: string, idx: number): QuantifierResult {
    const start = idx;
    idx++;
    let num = "";
    while (idx < s.length && /[0-9]/.test(s[idx])) num += s[idx++];
    if (num === "" || idx >= s.length) return { ok: false, next: start };
    const m = parseInt(num, 10);
    if (s[idx] === "}") {
      idx++;
      eatQuantMod();
      return { ok: true, next: idx, type: "exact", m };
    }
    if (s[idx] === ",") {
      idx++;
      let num2 = "";
      while (idx < s.length && /[0-9]/.test(s[idx])) num2 += s[idx++];
      if (idx >= s.length || s[idx] !== "}") return { ok: false, next: start };
      idx++;
      eatQuantMod();
      if (num2 === "") return { ok: true, next: idx, type: "open", m }; // {m,}
      const nmax = parseInt(num2, 10);
      return { ok: true, next: idx, type: "range", m, nmax }; // {m,n}
    }
    return { ok: false, next: start };
  }

  interface SequenceAnalysis {
    base: string;
    min: number;
    varLen: boolean;
  }
  function analyzeSimpleSequence(s: string): SequenceAnalysis | null {
    let idx = 0,
      minTotal = 0,
      variable = false;
    while (idx < s.length) {
      let unitMin = 0,
        unitVar = false;
      const ch = s[idx];
      if (ch === "(") return null;
      if (ch === "\\") {
        idx++;
        if (idx >= s.length) return null;
        const esc = s[idx++];
        if (esc === "b" || esc === "B") {
          unitMin = 0;
        } else if ("wdsWDS".includes(esc)) {
          unitMin = 1;
        } else {
          unitMin = 1;
        }
      } else if (ch === ".") {
        idx++;
        unitMin = 1;
      } else if (ch === "[") {
        const ni = parseClassInString(s, idx);
        if (ni < 0) return null;
        idx = ni;
        unitMin = 1;
      } else if (REGEX_SPECIAL.has(ch)) {
        return null;
      } else {
        idx++;
        unitMin = 1;
      }

      if (idx < s.length) {
        const q = s[idx];
        if (q === "*") {
          idx++;
          eatQuantMod();
          unitMin = 0;
          unitVar = true;
        } else if (q === "+") {
          idx++;
          eatQuantMod();
          unitMin = Math.max(1, unitMin);
          unitVar = true;
        } else if (q === "?") {
          idx++;
          eatQuantMod();
          unitMin = 0;
          unitVar = true;
        } else if (q === "{") {
          const br = parseBracesQuant(s, idx);
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
    return { base: "?".repeat(minTotal), min: minTotal, varLen: variable };
  }

  // ----- Recursive summarizer for nested patterns -----
  // 递归汇总：将子模式转为 glob，并估算 min/var
  function summarizePattern(sub: string): Unit | null {
    const g = regexToGlob(sub);
    if (g == null) return null;
    let min = 0,
      varStar = false;
    for (let k = 0; k < g.length; k++) {
      const ch = g[k];
      if (ch === "\\") {
        k++;
        if (k < g.length) min += 1;
      } else if (ch === "*") {
        varStar = true;
      } else if (ch === "?") {
        min += 1;
      } else {
        min += 1;
      }
    }
    return { glob: g, baseGlob: "?".repeat(min), canRepeat: true, min, isLiteral: false, varLen: varStar };
  }
  const globIsPureLiteral = (s: string) => s.indexOf("*") === -1 && s.indexOf("?") === -1;

  // ----- Group parsing (alternations, lookaheads, etc.) -----
  // 分组解析（交替 |、前瞻等）
  function parseGroup(): Unit | null {
    const parts: string[] = [];
    let depth = 1,
      buf = "",
      isAlt = false;

    // 处理 (?:...), (?=...), (?!...), (?<=...), (?<!...)
    if (peek() === "?") {
      next();
      const kind: string = next();
      if (kind === ":") {
        // Non-capturing
        // 非捕获
      } else if (kind === "=" || kind === "!") {
        // 前瞻（零宽）
        let laDepth = 1;
        while (i < n && laDepth > 0) {
          const ch2 = next();
          if (ch2 === "\\") {
            if (!next()) return null;
          } else if (ch2 === "(") laDepth++;
          else if (ch2 === ")") laDepth--;
        }
        if (laDepth !== 0) return null;
        return { glob: "", baseGlob: "", canRepeat: false, min: 0, isLiteral: false, varLen: false };
      } else if (kind === "<") {
        const lb = next();
        if (lb === "=" || lb === "!") {
          let lbDepth = 1;
          while (i < n && lbDepth > 0) {
            const ch2 = next();
            if (ch2 === "\\") {
              if (!next()) return null;
            } else if (ch2 === "(") lbDepth++;
            else if (ch2 === ")") lbDepth--;
          }
          if (lbDepth !== 0) return null;
          return { glob: "", baseGlob: "", canRepeat: false, min: 0, isLiteral: false, varLen: false };
        } else {
          buf += "<?" + lb;
        }
      } else {
        buf += "?" + kind;
      }
    }

    // 解析内容并在最外层分割 '|'
    while (i < n && depth > 0) {
      const ch: string = next();
      if (ch === "\\") {
        const esc = next();
        if (!esc) return null;
        // preserve escape while scanning
        // 保留转义
        buf += "\\" + esc;
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
    if (depth > 0) return null;
    if (buf) parts.push(buf);

    if (isAlt) {
      // === 即便分支含有量詞/特殊符，也先做字面量的公共前/後綴抽取 ===
      // 這能讓 (http|https?) 抽出 'http' 作為前綴，剩餘中段做總結後再合併。
      const heads = parts.map((p) => literalHeadInfo(p).lit);
      const tails = parts.map((p) => literalTailInfo(p).lit);
      const pref = lcp(heads);
      const suff = lcs(tails);

      if (pref || suff) {
        const mids: Unit[] = [];
        for (const arm of parts) {
          const s1 = headSrcLenFor(arm, pref);
          const s2 = tailSrcLenFor(arm, suff);
          const mid = arm.slice(s1, arm.length - s2);
          const su = summarizePattern(mid) || {
            glob: "*",
            baseGlob: "",
            canRepeat: true,
            min: 0,
            isLiteral: false,
            varLen: true,
          };
          mids.push(su);
        }
        const minLen = Math.min(...mids.map((u) => u.min));
        const variable = mids.some((u) => u.varLen) || new Set(mids.map((u) => u.min)).size > 1;
        const baseCore = "?".repeat(minLen);
        const glob = pref + baseCore + (variable ? "*" : "") + suff;
        return {
          glob,
          baseGlob: pref + baseCore + suff,
          canRepeat: true,
          min: pref.length + minLen + suff.length,
          isLiteral: false,
          varLen: variable,
        };
      }

      const lens: number[] = parts.map(fixedLiteralLength);
      if (lens.every((x) => x >= 0)) {
        const minLen = Math.min(...lens);
        const maxLen = Math.max(...lens);
        const base = "?".repeat(minLen);
        return {
          glob: base + (maxLen > minLen ? "*" : ""),
          baseGlob: base,
          canRepeat: true,
          min: minLen,
          isLiteral: false,
          varLen: maxLen > minLen,
        };
      }

      // 1) 原始纯字面量分支：提取公共前后缀
      const literalArms: (string | null)[] = parts.map(unescapeRegexLiteral);
      if (literalArms.every((x) => x != null)) {
        const lits = literalArms as string[];
        const pref = lcp(lits);
        const suff = lcs(lits);
        const mids = lits.map((s) => s.slice(pref.length, s.length - suff.length));
        const minMid = Math.min(...mids.map((m) => m.length));
        const variable = new Set(mids.map((m) => m.length)).size > 1;
        const baseCore = "?".repeat(minMid);
        const glob = pref + baseCore + (variable ? "*" : "") + suff;
        const min = pref.length + minMid + suff.length;
        return { glob, baseGlob: pref + baseCore + suff, canRepeat: true, min, isLiteral: false, varLen: variable };
      }

      // 2) 简单序列分析
      const analyzed = parts.map(analyzeSimpleSequence);
      if (analyzed.every((x) => x)) {
        const mins = analyzed.map((x) => x!.min);
        const minLen = Math.min(...mins);
        const variable = analyzed.some((x) => x!.varLen) || new Set(mins).size > 1;
        const base = "?".repeat(minLen);
        return {
          glob: base + (variable ? "*" : ""),
          baseGlob: base,
          canRepeat: true,
          min: minLen,
          isLiteral: false,
          varLen: variable,
        };
      }

      // 3) 新增：汇总每个分支，然后合并（处理前瞻/后顾等零宽情况）
      const sums = parts.map((p) => summarizePattern(p));
      if (sums.every((u) => u)) {
        const units = sums as Unit[];
        const allLit = units.every((u) => globIsPureLiteral(u.glob));
        if (allLit) {
          const lens = units.map((u) => u.min);
          const minLen = Math.min(...lens);
          const maxLen = Math.max(...lens);
          const base = "?".repeat(minLen);
          return {
            glob: base + (maxLen > minLen ? "*" : ""),
            baseGlob: base,
            canRepeat: true,
            min: minLen,
            isLiteral: false,
            varLen: maxLen > minLen,
          };
        } else {
          const mins = units.map((u) => u.min);
          const minLen = Math.min(...mins);
          const variable = units.some((u) => u.varLen) || new Set(mins).size > 1;

          const base = "?".repeat(minLen);

          return {
            glob: base + (variable ? "*" : ""),
            baseGlob: base,
            canRepeat: true,
            min: minLen,
            isLiteral: false,
            varLen: variable,
          };
        }
      }

      // 兜底
      return { glob: "*", baseGlob: "*", canRepeat: true, min: 0, isLiteral: false, varLen: true };
    }

    // Non-alternation group: prefer literal, then summarize, then simple analysis
    // 非交替分组：先字面量，再递归汇总，再简单分析
    const inner = parts[0] ?? "";
    const literal: string | null = unescapeRegexLiteral(inner);
    if (literal != null) {
      return { glob: literal, baseGlob: literal, canRepeat: true, min: literal.length, isLiteral: true, varLen: false };
    }
    const sum = summarizePattern(inner);
    if (sum) return sum;
    const seq = analyzeSimpleSequence(inner);
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
  function parseUnit(): Unit | null {
    const ch: string = next();

    if (ch === "\\") {
      const esc: string = next();
      if (!esc) return null; // Unterminated escape 转义未结束
      if (esc === "b" || esc === "B")
        return { glob: "", baseGlob: "", canRepeat: false, min: 0, isLiteral: false, varLen: false }; // word boundary 词边界
      if ("wdsWDS".includes(esc))
        return { glob: "?", baseGlob: "?", canRepeat: true, min: 1, isLiteral: false, varLen: false }; // class-like escapes 类似 \w \d \s
      const lit: string = escapeGlobLiteral(esc); // includes '*'/'?' → '?' 其他转义（含 '*'/'?'）→ 字面（映射规则里 '*'/'?' → '?'
      return { glob: lit, baseGlob: lit, canRepeat: true, min: 1, isLiteral: true, varLen: false };
    }

    if (ch === ".") return { glob: "?", baseGlob: "?", canRepeat: true, min: 1, isLiteral: false, varLen: false };
    if (ch === "[") return parseCharClass();
    if (ch === "(") return parseGroup();
    if (ch === "^" || ch === "$")
      return { glob: "", baseGlob: "", canRepeat: false, min: 0, isLiteral: false, varLen: false }; // anchors 锚点零宽

    // 頂層遇到孤立的關閉符直接判定為無效語法
    if (ch === ")" || ch === "]") {
      return null;
    }

    // Plain literal character / 普通字面量字符
    const lit: string = escapeGlobLiteral(ch);
    return { glob: lit, baseGlob: lit, canRepeat: true, min: 1, isLiteral: true, varLen: false };
  }

  // ----- Quantifiers ----- 数量词应用
  function applyQuantifier(unit: Unit | null): string | null {
    if (unit === null) return null;

    // '*' / '*?' / '*+' —— 任意长度
    if (peek() === "*") {
      next();
      eatQuantMod();
      return "*";
    }

    // '+' / '+?' / '++' —— 至少一次：base + '*'
    if (peek() === "+") {
      next();
      eatQuantMod();
      return (unit.baseGlob || unit.glob) + "*";
    }

    // '?' / '??' / '?+' —— 可选：统一为 '*'
    if (peek() === "?") {
      next();
      eatQuantMod();
      return "*";
    }

    // '{m}', '{m,}', '{m,n}'（懒惰/占有修饰同样处理）
    if (peek() === "{") {
      const save = i;
      next();
      let num = "";
      while (/[0-9]/.test(peek())) num += next();
      if (num === "" || (peek() !== "}" && peek() !== ",")) {
        i = save;
        return unit.glob; // 回退为单元字面
      }
      const m = parseInt(num, 10);
      const baseForRepeat = unit.isLiteral ? unit.glob : unit.baseGlob || unit.glob;

      if (eatIf("}")) {
        eatQuantMod();
        return baseForRepeat.repeat(m);
      }
      if (eatIf(",")) {
        let num2 = "";
        while (/[0-9]/.test(peek())) num2 += next();
        if (!eatIf("}")) {
          i = save;
          return unit.glob;
        }
        const core = baseForRepeat.repeat(m);
        eatQuantMod();
        if (num2 === "") return core + "*"; // {m,}
        const nmax = parseInt(num2, 10);
        return core + (Number.isNaN(nmax) || nmax > m ? "*" : ""); // {m,n}
      }
    }

    // 无数量词：返回单元 glob
    return unit.glob;
  }

  // ----- Main ----- 主流程
  while (i < n) {
    const unit: Unit | null = parseUnit();
    if (unit === null) return null; // 语法错误
    const piece: string | null = applyQuantifier(unit);
    if (piece === null) return null; // 数量词错误
    out.push(piece);
  }

  // Canonicalize runs of '*' and '?' (e.g., "*?*" -> "?*")
  // 规范化连续的 '*' 与 '?'（如 "*?*" 归一为 "?*"）
  let glob: string = out.join("");
  glob = glob.replace(/[*?]+/g, (m: string): string => {
    const q: number = (m.match(/\?/g) || []).length;
    const hasStar: boolean = m.indexOf("*") !== -1;
    if (!hasStar) return "?".repeat(q);
    if (q === 0) return "*";
    if (q === 1) return "?*";
    return "?".repeat(q) + "*";
  });

  return glob;
}
