import Logger from "@App/app/logger/logger";

export interface Url {
  scheme: string;
  host: string;
  path: string;
  search: string;
}

export default class Match<T> {
  protected cache = new Map<string, T[]>();

  protected rule = new Map<string, T[]>();

  protected kv = new Map<string, T>();

  forEach(fn: (val: T, key: string) => void) {
    this.kv.forEach((val, key) => {
      fn(val, key);
    });
  }

  protected parseURL(url: string): Url | undefined {
    if (url.indexOf("*http") === 0) {
      url = url.substring(1);
    }
    const match = /^(.+?):\/\/(.*?)((\/.*?)(\?.*?|)|)$/.exec(url);
    if (match) {
      return {
        scheme: match[1],
        host: match[2],
        path: match[4] || (url[url.length - 1] === "*" ? "*" : "/"),
        search: match[5],
      };
    }
    // 处理一些特殊情况
    switch (url) {
      case "*":
        return {
          scheme: "*",
          host: "*",
          path: "*",
          search: "*",
        };
      default:
    }
    return undefined;
  }

  protected compileRe(url: string): string {
    const u = this.parseURL(url);
    if (!u) {
      return "";
    }
    switch (u.scheme) {
      case "*":
        u.scheme = ".+?";
        break;
      case "http*":
        u.scheme = "http[s]?";
        break;
      default:
    }
    let pos = u.host.indexOf("*");
    if (u.host === "*" || u.host === "**") {
      pos = -1;
    } else if (u.host.endsWith("*")) {
      // 处理*结尾
      if (!u.host.endsWith(":*")) {
        u.host = u.host.substring(0, u.host.length - 1);
      }
    }
    u.host = u.host.replace(/\*/g, "[^/]*?");
    // 处理 *.开头
    if (u.host.startsWith("[^/]*?.")) {
      u.host = `([^/]*?\\.?)${u.host.substring(7)}`;
    } else if (pos !== -1) {
      if (u.host.indexOf(".") === -1) {
        return "";
      }
    }
    // 处理顶域
    if (u.host.endsWith("tld")) {
      u.host = `${u.host.substr(0, u.host.length - 3)}.*?`;
    }
    // 处理端口
    const pos2 = u.host.indexOf(":");
    if (pos2 === -1) {
      u.host = `${u.host}(:\\d+)?`;
    } else {
      const port = u.host.substring(pos2 + 1);
      if (port === "*") {
        u.host = `${u.host.substring(0, pos2)}(:\\d+)?`;
      } else {
        u.host = `${u.host.substring(0, pos2)}(:${port})?`;
      }
    }
    let re = `^${u.scheme}://${u.host}`;
    if (u.path === "/") {
      re += "[/]?";
    } else {
      re += u.path.replace(/\*/g, ".*?");
    }
    if (u.search) {
      re += u.search.replace(/([\\?])/g, "\\$1").replace(/\*/g, ".*?");
    }
    return `${re.replace(/\//g, "/")}$`;
  }

  public add(url: string, val: T) {
    const re = this.compileRe(url);
    if (!re) {
      throw new Error(`invalid url: ${url}`);
    }
    let rule = this.rule.get(re);
    if (!rule) {
      rule = [];
      this.rule.set(re, rule);
    }
    rule.push(val);
    this.kv.set(Match.getId(val), val);
    this.delCache();
  }

  public match(url: string): T[] {
    let ret = this.cache.get(url);
    if (ret) {
      return ret;
    }
    ret = [];
    try {
      this.rule.forEach((val, key) => {
        const re = new RegExp(key);
        if (re.test(url) && ret) {
          ret.push(...val);
        }
      });
    } catch (e) {
      console.warn("bad match rule", Logger.E(e));
      // LoggerCore.getLogger({ component: "match" }).warn(
      //   "bad match rule",
      //   Logger.E(e)
      // );
    }
    this.cache.set(url, ret);
    return ret;
  }

  protected static getId(val: any): string {
    if (typeof val === "string") {
      return val;
    }
    return (<{ uuid: string }>(<unknown>val)).uuid;
  }

  public del(val: T) {
    const id = Match.getId(val);
    this.rule.forEach((rules, key) => {
      const tmp: T[] = [];
      rules.forEach((rule) => {
        if (Match.getId(rule) !== id) {
          tmp.push(rule);
        }
      });
      if (tmp) {
        this.rule.set(key, tmp);
      } else {
        this.rule.delete(key);
      }
    });
    this.delCache();
  }

  protected delCache() {
    this.cache.clear();
  }
}

export class UrlMatch<T> extends Match<T> {
  protected excludeMatch = new Match<T>();

  public exclude(url: string, val: T) {
    this.excludeMatch.add(url, val);
  }

  public del(val: T): void {
    super.del(val);
    this.excludeMatch.del(val);
    this.cache.clear();
  }

  public match(url: string): T[] {
    const cache = this.cache.get(url);
    if (cache) {
      return cache;
    }
    let ret = super.match(url);
    // 排除
    const includeMap = new Map();
    ret.forEach((val) => {
      includeMap.set(Match.getId(val), val);
    });
    const exclude = this.excludeMatch.match(url);
    const excludeMap = new Map();
    exclude.forEach((val) => {
      excludeMap.set(Match.getId(val), 1);
    });
    ret = [];
    includeMap.forEach((val: T, key) => {
      if (!excludeMap.has(key)) {
        ret.push(val);
      }
    });
    this.cache.set(url, ret);
    return ret;
  }
}

export interface PatternMatchesUrl {
  scheme: string;
  host: string;
  path: string;
}

// 解析URL, 根据https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns?hl=zh-cn进行处理
export function parsePatternMatchesURL(
  url: string,
  options?: {
    exclude?: boolean;
  }
): PatternMatchesUrl | undefined {
  let result: PatternMatchesUrl | undefined;
  const match = /^(.+?):\/\/(.*?)(\/(.*?)(\?.*?|)|)$/.exec(url);
  if (match) {
    result = {
      scheme: match[1],
      host: match[2],
      path: match[4] || (url[url.length - 1] === "*" ? "*" : ""),
    };
  } else {
    // 处理一些特殊情况
    switch (url) {
      case "*":
        result = {
          scheme: "*",
          host: "*",
          path: "*",
        };
        break;
      default:
    }
  }
  if (result) {
    if (result.host !== "*") {
      // *开头但是不是*.的情况
      if (result.host.startsWith("*")) {
        if (!result.host.startsWith("*.")) {
          // 删除开头的*号
          result.host = result.host.slice(1);
        }
      }
      // 结尾是*的情况
      if (result.host.endsWith("*")) {
        result.host = result.host.slice(0, -1);
      }
      // 处理 www.*.example.com 的情况为 *.example.com
      const pos = result.host.lastIndexOf("*");
      if (pos > 0 && pos < result.host.length - 1) {
        if (options && options.exclude) {
          // 如果是exclude, 按最小匹配处理
          // 包括*也去掉
          result.host = result.host.substring(pos + 1);
          if (result.host.startsWith(".")) {
            result.host = result.host.substring(1);
          }
        } else {
          // 如果不是exclude
          // 将*前面的全部去掉
          result.host = result.host.substring(pos);
        }
      }
    }
  }
  return result;
}

// 处理油猴的match和include为chrome的pattern-matche
export function dealPatternMatches(
  matches: string[],
  options?: {
    exclude?: boolean;
  }
) {
  const patternResult: string[] = [];
  const result: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const url = parsePatternMatchesURL(matches[i], options);
    if (url) {
      patternResult.push(`${url.scheme}://${url.host}/${url.path}`);
      result.push(matches[i]);
    }
  }
  return {
    patternResult,
    result,
  };
}
