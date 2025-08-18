export type URLRuleEntry = {
  ruleType: number;
  ruleContent: string | string[] | RegExp;
  ruleTag: string;
  patternString: string;
};

// 检查@match @include @exclude 是否按照MV3的 match pattern
// export 只用於测试，不要在外部直接引用 checkUrlMatch
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
          let pathPattern = s.substring(idx2 + 1);
          // if (pathPattern.includes("**")) {
          //   pathPattern = pathPattern.replace(/\*{2,}/g, "*");
          // }
          extMatch = [scheme, host, pathPattern];
        }
      }
    }
  }
  return extMatch;
}

const globSplit = (text: string) => {
  text = text.replace(/\*{2,}/g, "*"); // api定义的 glob * 是等价於 glob **
  text = text.replace(/\*\?+/g, "*"); // 暂不支持 "*?" (需要backward处理)
  return text.split(/([*?])/g);
};

export const metaUMatchAnalyze = (lines: string[]): URLRuleEntry[] => {
  const rules = [];
  for (const line of lines) {
    const mt = /@(match|include|exclude)\s+([^\t\r\n]+?)([\r\n]|$)/.exec(line);
    if (!mt) continue;
    const [_, tag, content0] = mt;
    let content = content0;
    if (content.charAt(0) !== "/") {
      // glob pattern & match pattern
      if (content.includes("**")) {
        content = content.replace("**", "*"); // glob * 修正
      }
      if (tag !== "match" && content.includes(".tld/")) {
        // 处理 GM 的 .tld 问题
        // 转化为 glob pattern .??*/
        content = content.replace(".tld/", ".??*/");
      }
    }

    if (tag === "match") {
      // match pattern
      const mch = checkUrlMatch(content);
      if (!mch) continue;
      rules.push({
        ruleType: 1,
        ruleContent: mch,
        ruleTag: tag,
        patternString: content,
      });
      continue;
    }

    if (tag === "include") {
      const mch = checkUrlMatch(content);
      if (mch) {
        // match pattern
        rules.push({
          ruleType: 1,
          ruleContent: mch,
          ruleTag: tag,
          patternString: content,
        });
        continue;
      }

      const rch = /^\/(.+)\/([a-z]*)$/.exec(content);
      if (rch) {
        // re pattern
        rules.push({
          ruleType: 5,
          ruleContent: new RegExp(rch[1], rch[2] || ""),
          ruleTag: tag,
          patternString: content,
        });
        continue;
      }
      // glob pattern (* and ?)
      rules.push({
        ruleType: 3,
        ruleContent: globSplit(content),
        ruleTag: tag,
        patternString: content,
      });
      continue;
    }

    if (tag === "exclude") {
      const mch = checkUrlMatch(content);
      if (mch) {
        // match pattern
        rules.push({
          ruleType: 2,
          ruleContent: mch,
          ruleTag: tag,
          patternString: content,
        });
        continue;
      }

      const rch = /^\/(.+)\/([a-z]*)$/.exec(content);
      if (rch) {
        // re pattern
        rules.push({
          ruleType: 6,
          ruleContent: new RegExp(rch[1], rch[2] || ""),
          ruleTag: tag,
          patternString: content,
        });
        continue;
      }

      // glob pattern (* and ?)
      rules.push({
        ruleType: 4,
        ruleContent: globSplit(content),
        ruleTag: tag,
        patternString: content,
      });
      continue;
    }
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
    case 1:
      ret = isUrlMatchPattern(url, rule.ruleContent as string[]);
      break;
    case 2:
      ret = !isUrlMatchPattern(url, rule.ruleContent as string[]);
      break;
    case 3:
      ret = isUrlMatchGlob(url, rule.ruleContent as string[]);
      break;
    case 4:
      ret = !isUrlMatchGlob(url, rule.ruleContent as string[]);
      break;
    case 5:
      ret = isUrlMatchRegEx(url, rule.ruleContent as RegExp);
      break;
    case 6:
      ret = !isUrlMatchRegEx(url, rule.ruleContent as RegExp);
      break;
    default:
      throw new Error("invalid ruleType");
  }
  if (urlMatchCache.size > 512) urlMatchCache.clear();
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
  const path = `${url.pathname}${url.search || "?"}`.substring(1);
  const arr = m[2].split("*");
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
  return idx === path.length || (path.endsWith("?") && idx === path.length - 1);
}

function isUrlMatchGlob(s: string, gs: string[]) {
  const idx1 = s.indexOf("#");
  if (idx1 >= 0) {
    const idx2 = s.indexOf("#", idx1 + 1);
    if (idx2 > 0) {
      try {
        const url = new URL(s);
        if (!s.endsWith(url.hash)) {
          return false; // URL错误，无法匹对
        }
        s = s.substring(0, s.length - url.hash.length);
      } catch {
        return false; // URL错误，无法匹对
      }
    } else {
      s = s.substring(0, idx1);
    }
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
      if (!next) throw new Error("invalid glob");
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
  return idx === path.length || (path.endsWith("?") && idx === path.length - 1);
}

function isUrlMatchRegEx(s: string, re: RegExp) {
  return re.test(s);
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

export const isAllUrlsRequired = (globs: string[]) => {
  for (const glob of globs) {
    const m = /(\w+):\/\//.exec(glob);
    if (m && m[1]) {
      if (!m[1].startsWith("http")) return true;
    }
  }
  return false;
};

export const getApiMatchesAndGlobs = (urlCovering: URLRuleEntry[]) => {
  const urlMatching = urlCovering.filter((e) => e.ruleType === 1);
  const urlSpecificMatching = urlMatching.filter((e) => e.patternString !== "*://*/*");
  let matchAll = 0;
  if (
    urlSpecificMatching.length === 0 ||
    urlSpecificMatching.length !== urlMatching.length ||
    urlCovering.some((e) => e.ruleType === 5)
  ) {
    matchAll = 1;
  }

  const apiIncludeGlobs = toUniquePatternStrings(urlCovering.filter((e) => e.ruleType === 3));
  if (apiIncludeGlobs.length > 0) matchAll = 1;

  if (matchAll && urlSpecificMatching.length > 0) {
    addMatchesToGlobs(urlSpecificMatching, apiIncludeGlobs);
  }

  if (apiIncludeGlobs.length > 0) {
    if (isAllUrlsRequired(apiIncludeGlobs)) {
      matchAll = 2;
    }
  }

  const apiMatches = matchAll
    ? matchAll === 2
      ? ["<all_urls>"]
      : ["*://*/*"]
    : toUniquePatternStrings(urlSpecificMatching);

  return {
    matches: apiMatches, // primary
    includeGlobs: apiIncludeGlobs, // includeGlobs applied after matches
  };
};
