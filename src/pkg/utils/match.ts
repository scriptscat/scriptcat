/* eslint-disable max-classes-per-file */

import Logger from "@App/app/logger/logger";

export default class Match<T> {
  protected cache = new Map<string, T[]>();

  protected rule = new Map<string, T[]>();

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
    } else if (pos !== -1 && pos !== 0) {
      return "";
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
      // eslint-disable-next-line no-console
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
    if (typeof val === "object") {
      return (<{ id: string }>(<unknown>val)).id;
    }
    return <string>(<unknown>val);
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

export interface Url {
  scheme: string;
  host: string;
  path: string;
  search: string;
}

export class UrlInclude<T> extends UrlMatch<T> {
  protected parseURL(url: string): Url | undefined {
    const ret = super.parseURL(url);
    if (ret) {
      return ret;
    }
    if (url === "http*") {
      return { scheme: "*", host: "*", path: "*", search: "*" };
    }
    const match = /^(.*?)((\/.*?)(\?.*?|)|)$/.exec(url);
    if (match) {
      return {
        scheme: "*",
        host: match[1],
        path: match[3] || (url[url.length - 1] === "*" ? "*" : "/"),
        search: match[4],
      };
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
    u.host = u.host.replace(/\*/g, "[^/]*?");
    // 处理 *.开头
    if (u.host.startsWith("[^/]*?.")) {
      u.host = `([^/]*?.?)${u.host.substring(7)}`;
    }
    // 处理顶域
    if (u.host.endsWith("tld")) {
      u.host = `${u.host.substring(0, u.host.length - 3)}.*?`;
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
}
