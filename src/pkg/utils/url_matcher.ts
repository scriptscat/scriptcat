import { regexToGlob } from "./regex_to_glob";
import { isFirefox } from "./utils";

export const enum RuleType {
  MATCH_INCLUDE = 1,
  MATCH_EXCLUDE = 2,
  GLOB_INCLUDE = 3,
  GLOB_EXCLUDE = 4,
  REGEX_INCLUDE = 5,
  REGEX_EXCLUDE = 6,
}

export const enum RuleTypeBit {
  INCLUSION = 1,
}

export type URLRuleEntry = {
  ruleType: RuleType;
  ruleContent: string | string[] | [string, string]; // 由于 cache 设计，ruleContent 不能含有 RegExp
  ruleTag: string;
  patternString: string;
};

const URL_MATCH_CACHE_MAX_SIZE = 512; // 用来做简单缓存，512 算是足够大小应付需要。

// 检查 @match @include @exclude @exclude-match 是否按照MV3的 match pattern
// export 只用于测试，不要在外部直接引用 checkUrlMatch
export const checkUrlMatch = (s: string): string[] | null => {
  s = s.trim();

  const idx1 = s.indexOf("://");
  let idx2 = -1;
  if (idx1 > 0) {
    idx2 = s.indexOf("/", idx1 + 3);
  }
  let extMatch: string[] | null = null;
  // 存在://和/才进行处理
  if (idx1 > 0 && idx2 > 0) {
    const scheme = s.substring(0, idx1);
    // 检查scheme
    if (/^(\*|[-a-z]+)$/.test(scheme)) {
      let host = s.substring(idx1 + 3, idx2);
      if (host.length === 0 && scheme !== "file") {
        // host is optional only if the scheme is "file".
      } else if (!host.includes(":") && host.charAt(0) !== "." && !host.includes("?")) {
        // *.<host>
        if (/^(\*|\*\..+)$/.test(host)) {
          host = host.substring(1);
        }
        if (!host.includes("*")) {
          const pathPattern = s.substring(idx2 + 1);
          extMatch = [scheme, host, pathPattern];
        }
      }
    }
  }
  return extMatch;
};

const globSplit = (text: string): string[] => {
  const split = text.split(/([*?]{2,})/g);
  for (let i = 1; i < split.length; i += 2) {
    // "*????" 改成 "????*"，避免 backward 处理
    // api定义的 glob * 是等价于 glob **
    const p = split[i]; // **??**??**
    const q = p.replace(/\*/g, ""); // ????
    if (p !== q) split[i] = `${q}*`; // ????*
  }
  return split.join("").split(/([*?])/g);
};

export const extractUrlPatterns = (lines: string[]): URLRuleEntry[] => {
  const rules = [];
  for (const line of lines) {
    const mt = /@(match|include|exclude-match|exclude)\s+([^\t\r\n]+?)([\r\n]|$)/.exec(line);
    if (!mt) continue;
    const [_, tag0, content0] = mt;
    const tag = tag0;
    // @exclude-match 是 @match 的排除版，取值按同一套 match pattern 规则处理
    const isMatchPattern = tag === "match" || tag === "exclude-match";
    let content = content0;
    if (content.charAt(0) !== "/") {
      if (isMatchPattern) {
        // @match, @exclude-match
        let m: RegExpExecArray | null;

        if (content === "*") {
          // 特殊处理 @match *
          // * 会对应成 *://*/
          content = "*://*/";
        } else {
          m = /^(\*|[-a-z]+|http\*):\/\/(\*?[^*/:]*)(:[^*/]*)?/.exec(content);
          if (!m) {
            // 如不是正确 match pattern, 为了兼容 TM，尝试 fallback 处理
            // 例如 "// @match www.youtube.com/*"
            let tu;
            try {
              tu = new URL(`undefined-protocol://${content}`); // e.g. "undefined-protocol://example.com/*"
            } catch (_e) {
              // 尝试失败则不忽略 （例如 "undefined-protocol://hello-world^^" ）
            }
            if (tu?.protocol === "undefined-protocol:" && tu.hostname && tu.pathname) {
              content = `*://${tu.hostname}${tu.pathname}${tu.search}`;
              m = /^(\*|[-a-z]+|http\*):\/\/(\*?[^*/:]*)(:[^*/]*)?/.exec(content);
            }
          }
          // 若无法匹对，则表示该表达式应为错误match pattern格式，忽略处理。
          if (m) {
            // 特殊处理：自动除去 port (TM的行为是以下完全等价)
            // https://www.google.com/*
            // https://www.google.com:/*
            // https://www.google.com:80/*
            // https://www.google.com:*/*
            // 所有port都会被视作匹配 (80, 443, ...)
            // 因此SC的处理只需要去除 :80 的部份，即可使用原生 match pattern

            // 特殊处理 https http
            let scheme = m[1];
            if (scheme === "http*") {
              scheme = "*";
            }

            let path = content.substring(m[0].length);
            // 特殊处理: 没有path的话，自动补斜线，即可使用原生 match pattern
            // 特殊处理: path的斜线前有*，TM视之为port的一部份，会自动去除
            if (!path || path === "*") {
              path = "/";
            } else if (path.startsWith("*/")) {
              path = path.substring(1);
            }

            let domain = m[2];
            // 特殊处理 *domain.com 为 *.domain.com
            if (domain.length >= 2 && domain[0] === "*" && domain[1] !== ".") {
              domain = `*.${domain.substring(1)}`;
            }

            content = `${scheme}://${domain}${path}`;
          }
        }
      } else {
        // @include, @exclude
        // 处理 GM 的 .tld 问题 (Magic TLD)
        // 转化为 glob pattern .??*/
        // 见 GM 的 magic tld 说明 - https://wiki.greasespot.net/Magic_TLD
        const tldIdx = content.indexOf(".tld/");
        if (tldIdx > 0) {
          // 最短匹配*.tld/
          const left = content.substring(0, tldIdx);
          // 斜线不能多于2个, 例如 https://www.hello.com/abc.tld/123
          if (left.split("/").length <= 3) {
            const right = content.substring(tldIdx + 5);
            content = `${left}.??*/${right}`;
          }
        }
      }
      // 内部处理用
      // 适用于 glob pattern 及 match pattern
      if (content.includes("**")) {
        // SC内部处理不能处理多过一个以上连续星号
        content = content.replace(/\*{2,}/g, "*"); // glob * 修正
      }
    }

    if (isMatchPattern) {
      // match pattern；解析失败直接丢弃，不像 @exclude 那样退化成 glob/正则
      const mch = checkUrlMatch(content);
      if (!mch) continue;
      rules.push({
        ruleType: tag === "match" ? RuleType.MATCH_INCLUDE : RuleType.MATCH_EXCLUDE,
        ruleContent: mch,
        ruleTag: tag,
        patternString: content,
      });
      continue;
    }

    let isExclusion = false;

    if (tag === "include") {
      // do nothing
    } else if (tag === "exclude") {
      isExclusion = true;
    } else {
      continue;
    }

    if (content.includes("*.")) {
      // 与TM一致，不转换至 match
    } else {
      const mch = checkUrlMatch(content);
      if (mch) {
        // match pattern
        rules.push({
          ruleType: isExclusion ? RuleType.MATCH_EXCLUDE : RuleType.MATCH_INCLUDE,
          ruleContent: mch,
          ruleTag: tag,
          patternString: content,
        });
        continue;
      }
    }

    const rch = /^\/(.+)\/([a-z]*)$/.exec(content);
    if (rch) {
      // re pattern 正则表达式
      let re = null;
      try {
        re = new RegExp(rch[1], rch[2] || "i"); // case-insensitive 不区分大小写
        // 默认加上 "i"（不区分大小写），除非用户提供标志
        // 这样做是为了与其他脚本管理器（如 Tampermonkey）保持一致，符合常见的 URL 匹配预期
        // 参考: https://github.com/violentmonkey/violentmonkey/issues/1044#issuecomment-674652499
      } catch {
        // 忽略不正确的 regex pattern
      }
      if (re === null) continue; // 忽略不正确的 regex pattern
      rules.push({
        ruleType: isExclusion ? RuleType.REGEX_EXCLUDE : RuleType.REGEX_INCLUDE,
        ruleContent: [rch[1], rch[2]] as [string, string],
        ruleTag: tag,
        patternString: content,
      });
      continue;
    }
    // glob pattern (* and ?)
    rules.push({
      ruleType: isExclusion ? RuleType.GLOB_EXCLUDE : RuleType.GLOB_INCLUDE,
      ruleContent: globSplit(content),
      ruleTag: tag,
      patternString: content,
    });
  }
  return rules;
};

/**
 * 取 @match pattern 归一化后的网域部分：具体网域返回该网域，`*.example.com` 返回 `.example.com`，
 * `*` 返回空字串，不是 match pattern 则返回 null。
 * 用于判断一条 @match 是否只服务于某个具体网域（== host 时才是）。
 */
export const getMatchPatternHost = (pattern: string): string | null => {
  const [rule] = extractUrlPatterns([`@match ${pattern}`]);
  return rule ? (rule.ruleContent as string[])[1] : null;
};

export const toUniquePatternStrings = (x: URLRuleEntry[]) => {
  return [...new Set<string>(x.map((e: URLRuleEntry) => e.patternString))];
};

const urlMatchCache = new Map<string, boolean>();
export const isUrlMatch = (url: string, rule: URLRuleEntry) => {
  const cacheKey = `${rule.ruleTag} ${rule.patternString}\t${url}`;
  let ret = urlMatchCache.get(cacheKey);
  if (typeof ret === "boolean") return ret;
  switch (rule.ruleType) {
    case RuleType.MATCH_INCLUDE:
      ret = isUrlMatchPattern(url, rule.ruleContent as string[]);
      break;
    case RuleType.MATCH_EXCLUDE:
      ret = !isUrlMatchPattern(url, rule.ruleContent as string[]);
      break;
    case RuleType.GLOB_INCLUDE:
      ret = isUrlMatchGlob(url, rule.ruleContent as string[]);
      break;
    case RuleType.GLOB_EXCLUDE:
      ret = !isUrlMatchGlob(url, rule.ruleContent as string[]);
      break;
    case RuleType.REGEX_INCLUDE:
      ret = isUrlMatchRegEx(url, rule.ruleContent as [string, string]);
      break;
    case RuleType.REGEX_EXCLUDE:
      ret = !isUrlMatchRegEx(url, rule.ruleContent as [string, string]);
      break;
    default:
      throw new Error("invalid ruleType");
  }
  if (urlMatchCache.size > URL_MATCH_CACHE_MAX_SIZE) urlMatchCache.clear();
  urlMatchCache.set(cacheKey, ret);
  return ret;
};

const isUrlMatchPattern = (s: string, m: string[]): boolean => {
  let url;
  try {
    url = new URL(s);
  } catch {
    return false;
  }
  if (m[0] !== "*" && url.protocol !== `${m[0]}:`) return false;
  if (m[1]) {
    if (m[1].charAt(0) === ".") {
      if (!`.${url.hostname}`.endsWith(`${m[1]}`)) return false;
    } else {
      if (`${url.hostname}` !== `${m[1]}`) return false;
    }
  }
  const path = `${url.pathname}${url.search || "?"}`;
  const arr = `/${m[2]}`.split("*");
  let idx = 0;
  let k = 0;
  const l = arr.length;

  const pathMatches = new Array(arr.length - 1);

  if (!path.startsWith(`${arr[0]}`)) return false;
  idx = `${arr[0]}`.length;

  k = 1;
  while (k < l) {
    if (k === l - 1 && arr[k] === "") {
      pathMatches[k - 1] = path.substring(idx);
      idx = path.length;
      break;
    }
    const jdx = path.indexOf(arr[k], idx);
    if (jdx < 0) return false;
    pathMatches[k - 1] = path.substring(idx, jdx);
    idx = jdx + arr[k].length;
    k++;
  }
  // 当路径以单独的 "?" 结尾时也算匹配（即空查询字符串）。
  // 用于处理类似 "http://example.com/path?" 这样的 URL，
  // 确保在其余部分匹配时，这类 URL 也会被认为是匹配。
  return idx === path.length || (idx === path.length - 1 && path[idx] === "?");
};

const isUrlMatchGlob = (s: string, gs: string[]): boolean => {
  let hashPos = s.indexOf("#");
  if (hashPos >= 0) {
    const hashPos2 = s.indexOf("#", hashPos + 1);
    if (hashPos2 > 0) {
      try {
        const url = new URL(s);
        if (!s.endsWith(url.hash)) {
          return false; // URL错误，无法匹对
        }
        hashPos = s.length - url.hash.length;
      } catch {
        return false; // URL错误，无法匹对
      }
    }
    s = s.substring(0, hashPos);
  }
  if (!s.length) {
    // URL错误，无法匹对
    return false;
  }
  const path = s;
  const arr = gs;
  let idx = 0;
  let k = 0;
  const l = arr.length;
  const storeLen = (l - 1) / 2;

  const matches = new Array(storeLen);

  if (!path.startsWith(`${arr[0]}`)) return false;
  idx = `${arr[0]}`.length;
  let j = 2;

  while (j < l) {
    const d = arr[j - 1];
    const next = arr[j];
    if (d === "*") {
      // "*"
      if (j === l - 1 && next === "") {
        matches[k] = path.substring(idx);
        idx = path.length;
        break;
      }
      if (!next) throw new Error("invalid or unsupported glob"); // 不支持 ** 及 *? (已事先处理，故不会报错)
      const jdx = path.indexOf(next, idx);
      if (jdx < 0) return false;
      matches[k] = path.substring(idx, jdx);
      idx = jdx + next.length;
    } else {
      // "?"
      const jdx = idx + 1;
      if (path.substring(jdx, jdx + next.length) !== next) return false;
      matches[k] = path[idx];
      idx = jdx + next.length;
    }
    k++;
    j += 2;
  }
  // 当路径以单独的 "?" 结尾时也算匹配（即空查询字符串）。
  // 用于处理类似 "http://example.com/path?" 这样的 URL，
  // 确保在其余部分匹配时，这类 URL 也会被认为是匹配。
  return idx === path.length || (idx === path.length - 1 && path[idx] === "?");
};

const isUrlMatchRegEx = (s: string, ruleContent: [string, string]): boolean => {
  return new RegExp(ruleContent[0], ruleContent[1] || "i").test(s);
};

export const extractSchemesOfGlobs = (globs: string[]): string[] => {
  const set = new Set(["*://*/*"]);
  for (const glob of globs) {
    const m = /^([-\w]+):\/\//.exec(glob);
    if (m && m[1]) {
      if (!m[1].startsWith("http")) {
        if (m[1] === "file") {
          // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns#invalid_match_patterns
          set.add(`${m[1]}:///*`);
        } else {
          set.add(`${m[1]}://*/*`);
        }
      }
    }
  }
  return [...set];
};

// userScripts API 接受的 match pattern scheme；其余（chrome://、edge://、about: 等）注册时会抛 Invalid scheme，
// 而批量注册是原子的，一个脚本出错会让整批失败。Firefox 的 manifest.MatchPattern 额外接受 ws/wss，Chromium 不接受
const CHROMIUM_API_MATCH_SCHEMES = new Set(["*", "http", "https", "file", "ftp"]);
const FIREFOX_API_MATCH_SCHEMES = new Set(["*", "http", "https", "file", "ftp", "ws", "wss"]);

export const isApiSupportedMatchPattern = (pattern: string) =>
  (isFirefox() ? FIREFOX_API_MATCH_SCHEMES : CHROMIUM_API_MATCH_SCHEMES).has(
    pattern.substring(0, pattern.indexOf("://"))
  );

// 用户输入的 @match 值能否产生可注册的规则：解析失败的会被静默忽略，不支持的 scheme 会在注册时被丢弃
export const isRegistrableMatchPattern = (pattern: string) => {
  const [rule] = extractUrlPatterns([`@match ${pattern}`]);
  return rule?.ruleType === RuleType.MATCH_INCLUDE && isApiSupportedMatchPattern(rule.patternString);
};

// userScripts API 要求 matches 非空。脚本只有 glob 时用一个不可能有页面的地址占位（.invalid 是 RFC 6761 保留域名），
// 注册范围完全由 includeGlobs 决定
export const PLACEHOLDER_MATCH_PATTERN = "*://scriptcat.invalid/*";

const isApiSupportedGlob = (glob: string) => {
  const m = /^([-\w]+):\/\//.exec(glob);
  return !m || isApiSupportedMatchPattern(`${m[1]}://*/*`);
};

/**
 * 把脚本的 URL 规则转换成 userScripts API 的 matches / includeGlobs。
 *
 * Chrome 与 Firefox（134+）都把 matches 与 includeGlobs 取并集：网址命中任一即注入，而不是先 matches 再用
 * includeGlobs 过滤。所以 matches 只能放脚本真正的 match pattern，一旦放入全站 pattern，includeGlobs 就收不住范围，
 * 脚本代码会被注入到所有页面（#1803）。
 *
 * 正则 @include 能抽出 scheme://网域 时转成网域级 glob（比正则宽，页面里再按正则过滤）；抽不出时只能全站注册，
 * 以 regexUnbounded 告知调用方。
 */
export const getApiMatchesAndGlobs = (scriptUrlPatterns: URLRuleEntry[]) => {
  const includeGlobs: string[] = [];
  const addGlob = (glob: string) => {
    if (includeGlobs.includes(glob)) return;
    includeGlobs.push(glob);
    // 浏览器拿带 #hash 的完整网址匹配 glob，脚本猫的匹配会先去掉 hash；不以 * 结尾的 glob 需要补上 hash 的情况
    if (!glob.endsWith("*")) includeGlobs.push(`${glob}#*`);
  };
  for (const glob of toUniquePatternStrings(scriptUrlPatterns.filter((e) => e.ruleType === RuleType.GLOB_INCLUDE))) {
    if (isApiSupportedGlob(glob)) addGlob(glob);
  }

  let regexUnbounded = false;
  for (const rule of scriptUrlPatterns) {
    if (rule.ruleType !== RuleType.REGEX_INCLUDE) continue;
    // 正则默认忽略大小写，而 glob 区分大小写；只取 scheme 与网域，转小写后与浏览器规范化的网址一致
    const glob = regexToGlob(rule.ruleContent[0])?.toLowerCase();
    const m = glob ? /^([-a-z*?]+):\/\/([-_a-z0-9.:*?]+)(\/|$)/.exec(glob) : null;
    if (m) {
      addGlob(`${m[1]}://${m[2]}/*`);
    } else {
      regexUnbounded = true;
    }
  }

  const matches = toUniquePatternStrings(scriptUrlPatterns.filter((e) => e.ruleType === RuleType.MATCH_INCLUDE));
  // 非 http 的 glob（如 file:///）沿用整个 scheme 的 match pattern
  for (const pattern of extractSchemesOfGlobs(includeGlobs)) {
    if (pattern !== "*://*/*" && !matches.includes(pattern)) matches.push(pattern);
  }
  const apiMatches = matches.filter(isApiSupportedMatchPattern);

  if (regexUnbounded && !apiMatches.includes("*://*/*")) {
    return {
      matches: ["*://*/*", ...apiMatches.filter((pattern) => !/^(\*|https?):\/\//.test(pattern))],
      includeGlobs: [],
      regexUnbounded: true,
    };
  }
  if (apiMatches.length === 0 && includeGlobs.length > 0) apiMatches.push(PLACEHOLDER_MATCH_PATTERN);
  return { matches: apiMatches, includeGlobs, regexUnbounded: false };
};

export type EmbeddedURLRuleEntry = Pick<URLRuleEntry, "ruleType" | "ruleContent">;

export const embeddedPatternChecker = (
  url: string,
  scriptUrlPatterns: EmbeddedURLRuleEntry[],
  isUrlMatchPattern: (s: string, m: string[]) => boolean,
  isUrlMatchGlob: (s: string, gs: string[]) => boolean,
  isUrlMatchRegEx: (s: string, ruleContent: [string, string]) => boolean
): boolean => {
  // 这个会直接转换成Function代码于网页环境执行。请不要在这里引入任何外部代码
  let included = false;
  let excluded = false;
  for (const rule of scriptUrlPatterns) {
    switch (rule.ruleType) {
      case RuleType.MATCH_INCLUDE:
        included ||= isUrlMatchPattern(url, rule.ruleContent as string[]);
        break;
      case RuleType.MATCH_EXCLUDE:
        excluded ||= isUrlMatchPattern(url, rule.ruleContent as string[]);
        if (excluded) return false;
        break;
      case RuleType.GLOB_INCLUDE:
        included ||= isUrlMatchGlob(url, rule.ruleContent as string[]);
        break;
      case RuleType.GLOB_EXCLUDE:
        excluded ||= isUrlMatchGlob(url, rule.ruleContent as string[]);
        if (excluded) return false;
        break;
      case RuleType.REGEX_INCLUDE:
        included ||= isUrlMatchRegEx(url, rule.ruleContent as [string, string]);
        break;
      case RuleType.REGEX_EXCLUDE:
        excluded ||= isUrlMatchRegEx(url, rule.ruleContent as [string, string]);
        if (excluded) return false;
        break;
    }
  }
  return included;
};

export const embeddedPatternCheckerString = (url: string, patternArray: string): string => {
  return `(${embeddedPatternChecker})(${url},${patternArray},${isUrlMatchPattern},${isUrlMatchGlob},${isUrlMatchRegEx})`;
};
