import { regexToGlob } from "./regex_to_glob";

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

// 检查 @match @include @exclude 是否按照MV3的 match pattern
// export 只用于测试，不要在外部直接引用 checkUrlMatch
export function checkUrlMatch(s: string) {
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
}

const globSplit = (text: string) => {
  text = text.replace(/\*{2,}/g, "*"); // api定义的 glob * 是等价于 glob **
  text = text.replace(/\*(\?+)/g, "$1*"); // "*????" 改成 "????*"，避免 backward 处理
  return text.split(/([*?])/g);
};

export const extractUrlPatterns = (lines: string[]): URLRuleEntry[] => {
  const rules = [];
  for (const line of lines) {
    const mt = /@(match|include|exclude)\s+([^\t\r\n]+?)([\r\n]|$)/.exec(line);
    if (!mt) continue;
    const [_, tag0, content0] = mt;
    const tag = tag0;
    let content = content0;
    if (content.charAt(0) !== "/") {
      if (tag === "match") {
        // @match
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

    if (tag === "match") {
      // match pattern
      const mch = checkUrlMatch(content);
      if (!mch) continue;
      rules.push({
        ruleType: RuleType.MATCH_INCLUDE,
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

function isUrlMatchPattern(s: string, m: string[]) {
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
}

function isUrlMatchGlob(s: string, gs: string[]) {
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
}

function isUrlMatchRegEx(s: string, ruleContent: [string, string]) {
  return new RegExp(ruleContent[0], ruleContent[1] || "i").test(s);
}

export const addMatchesToGlobs = (matches: URLRuleEntry[], globs: string[]) => {
  for (const rule of matches) {
    if (rule.ruleType !== 1) continue;
    const [scheme0, host, path] = rule.ruleContent as string[];
    const scheme = scheme0 === "*" ? "http*" : scheme0;
    if (host.charAt(0) !== ".") {
      globs.push(`${scheme}://${host}/${path}`);
    } else {
      const h = host.substring(1);
      globs.push(`${scheme}://${h}/${path}`);
      globs.push(`${scheme}://*.${h}/${path}`);
    }
  }
};

export const extractMatchPatternsFromGlobs = (globs: string[]) => {
  return globs.map((glob) => {
    if (glob.startsWith("http*://")) {
      glob = `*://${glob.substring(8)}`;
    }
    const extMatch = checkUrlMatch(glob);
    if (!extMatch) return null;
    const [scheme, host] = extMatch;
    // glob 的 *.google.com 可以匹配 www.google.com 跟 my-website.com/abc.google.com
    if (host.charAt(0) === ".") return null;
    return `${scheme}://${host}/*`;
  });
};

export const extractSchemesOfGlobs = (globs: string[]) => {
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

export const getApiMatchesAndGlobs = (scriptUrlPatterns: URLRuleEntry[]) => {
  const urlMatching = scriptUrlPatterns.filter((e) => e.ruleType === RuleType.MATCH_INCLUDE);
  const urlSpecificMatching = urlMatching.filter((e) => e.patternString !== "*://*/*");
  let matchAll: string[] | null = null;

  // 原始的UrlPatterns中，match pattern 为空，或包括至少一个 *://*/* match pattern 时，先预设 match 为 *://*/*
  // 之后会再判断，例如追加 file:///*
  if (urlSpecificMatching.length === 0 || urlSpecificMatching.length !== urlMatching.length) {
    matchAll = ["*://*/*"]; // 包含 https 和 http
  }

  let regConvFallback = false;
  let regConvTryExtractDomain = false;
  const apiIncludeGlobs = toUniquePatternStrings(scriptUrlPatterns.filter((e) => e.ruleType === RuleType.GLOB_INCLUDE));
  const rulesForRegexInclude = scriptUrlPatterns.filter((e) => e.ruleType === RuleType.REGEX_INCLUDE);

  // 含有 regex 时，先转化成 glob pattern 再决定如何配合 UserScript API 的 match/glob pattern 注入
  if (rulesForRegexInclude.length > 0) {
    for (const rule of rulesForRegexInclude) {
      // 尝试利用JS代码，先把 regex pattern 转至 glob pattern, 最终尝试转化成 match pattern
      let globPattern = regexToGlob(rule.ruleContent[0]);
      if (globPattern !== null) {
        let m: RegExpExecArray | null = null;
        if ((m = /^([-_a-z0-9.:*?]+)$/.exec(globPattern))) {
          // 非网域的简单 globPattern (*apple*, *apple.com*)
          // globPattern = globPattern;
          regConvFallback = true;
        } else if ((m = /^([-a-z*?]+):\/\/([-_a-z0-9.:*?]+)(\/|$)/.exec(globPattern))) {
          // 简单 globPattern, 提取网域 ( *://www.google.com/search?q=*, https://www.apple.com/page=?1&g= )
          globPattern = `${m[1]}://${m[2]}/*`;
          regConvTryExtractDomain = true; // 会尝试转化成 match pattern
        } else {
          // 其他 globPattern, 不转换成 glob pattern
          globPattern = "*://*/*";
          regConvFallback = true;
        }
      } else {
        // regex pattern 转至 glob pattern
        globPattern = "*://*/*";
        regConvFallback = true;
      }

      if (apiIncludeGlobs.includes(globPattern)) {
        // 已存在，不重复添加
        continue;
      }
      apiIncludeGlobs.push(globPattern);
    }
  }

  // 由于有 glob pattern, 会先假设需要全域匹配，确保 UserScript API 的注入有效
  if (apiIncludeGlobs.length > 0 && !matchAll) matchAll = ["*://*/*"];

  // 为了改变现有的 match pattern, 现有的 match pattern 全部转换至 glob pattern, 并添加在目前的 globs
  if (matchAll && urlSpecificMatching.length > 0) {
    addMatchesToGlobs(urlSpecificMatching, apiIncludeGlobs);
  }

  // 有 globs 的情况下，需要进一步解析 globs 的规则，来决定
  // 1) globs 能充分转换成 match 网域 -> 缩小match范围
  // 2) globs 包含 http/https 以外的 scheme -> 增加match范围
  let apiMatches = null;
  if (apiIncludeGlobs.length > 0) {
    let matches = null;
    // 有 regex pattern 换成 glob pattern 的情况下，进一步分析 match pattern 的网域
    if (regConvTryExtractDomain && !regConvFallback) {
      // 有 regex pattern 换成 glob pattern, 且没有 fallback 的 regex pattern
      matches = new Set(extractMatchPatternsFromGlobs(apiIncludeGlobs));
      // 如果有部份glob无法抽出网域资料，维持 matchAll
      if (matches.has(null) || matches.size === 0) matches = null;
    }
    if (matches !== null) {
      // 所有 globs 能提取成 match 网域, 不用匹配所有网域
      apiMatches = [...matches] as string[];
    } else {
      // match 需要匹配所有网域
      // 如有 file:///* 之类，追加至 *://*/*
      matchAll = extractSchemesOfGlobs(apiIncludeGlobs);
    }
  }

  if (apiMatches === null) {
    // 如没有特定要求（ apiMatches 及 matchAll 皆为 null ），则探用原有的match
    apiMatches = matchAll || toUniquePatternStrings(urlSpecificMatching);
  }

  return {
    matches: apiMatches, // primary
    includeGlobs: apiIncludeGlobs, // includeGlobs applied after matches
  };
};
