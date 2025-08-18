import { isUrlMatch, metaUMatchAnalyze, type URLRuleEntry } from "./url_matcher";

// export interface Url {
//   scheme: string;
//   host: string;
//   path: string;
//   search: string;
// }

// const getId = (val: any) => {
//   if (typeof val === "string") {
//     return val;
//   }
//   return (<{ uuid: string }>(<unknown>val)).uuid;
// };

export class UrlMatch<T> {
  public readonly rulesMap = new Map<T, URLRuleEntry[]>();
  public readonly cacheMap = new Map<string, T[]>();
  private sorter: Partial<Record<string, number>> | null = null;
  public addRules(uuid: T, rules: URLRuleEntry[]) {
    this.cacheMap.clear();
    let map = this.rulesMap.get(uuid);
    if (!map) this.rulesMap.set(uuid, (map = []));
    map.push(...rules);
  }
  public clearRules(uuid: T) {
    this.cacheMap.clear();
    this.rulesMap.delete(uuid);
  }
  public urlMatch(url: string): T[] {
    const cacheMap = this.cacheMap;
    if (cacheMap.has(url)) return cacheMap.get(url) as T[];
    const s = new Set<T>();
    for (const [uuid, rules] of this.rulesMap.entries()) {
      let ruleIncluded = false;
      let ruleExcluded = false;
      for (const rule of rules) {
        if (rule.ruleType & 1) {
          // include
          if (!ruleIncluded && isUrlMatch(url, rule)) {
            ruleIncluded = true;
          }
        } else {
          // exclude
          if (!ruleExcluded && !isUrlMatch(url, rule)) {
            ruleExcluded = true;
            break;
          }
        }
      }
      if (ruleIncluded && !ruleExcluded) {
        s.add(uuid);
      }
    }
    const res = [...s];
    const sorter = this.sorter;
    if (sorter) {
      if (sorter !== null && typeof sorter === "object" && typeof res[0] === "string") {
        (res as string[]).sort((a, b) => {
          const p = sorter[a];
          const q = sorter[b];
          if (p! > -1 && q! > -1) {
            return p! - q!;
          }
          return a.localeCompare(b);
        });
      }
    }
    cacheMap.set(url, res);
    return res;
  }

  public del(uuid: T) {
    this.cacheMap.clear();
    this.rulesMap.delete(uuid);
  }

  public add(rulePattern: string, uuid: T) {
    // @include xxxxx
    const rules = metaUMatchAnalyze([rulePattern].map((e) => `@include ${e}`));
    this.addRules(uuid, rules);
  }

  public exclude(rulePattern: string, uuid: T) {
    // @exclude xxxxx
    const rules = metaUMatchAnalyze([rulePattern].map((e) => `@exclude ${e}`));
    this.addRules(uuid, rules);
  }

  public setupSorter(sorter: Partial<Record<string, number>>) {
    this.cacheMap.clear();
    this.sorter = sorter;
  }
}

// export class UrlMatch<T> implements IUrlMatch<T> {
//   protected cache = new Map<string, T[]>();

//   protected rule = new Map<string, T[]>();

//   protected kv = new Map<string, T>();

//   protected urlRulesMap = new Map<string, URLRuleEntry[]>();

//   public forEach(fn: (val: T, key: string) => void) {
//     this.kv.forEach((val, key) => {
//       fn(val, key);
//     });
//   }

//   private parseURL(url: string): Url | undefined {
//     if (url.startsWith("*http")) {
//       url = url.substring(1);
//     }
//     const match = /^(.+?):\/\/(.*?)((\/.*?)(\?.*?|)|)$/.exec(url);
//     if (match) {
//       return {
//         scheme: match[1],
//         host: match[2],
//         path: match[4] || (url[url.length - 1] === "*" ? "*" : "/"),
//         search: match[5],
//       };
//     }
//     return undefined;
//   }

//   private compileReString(url: string): string {
//     const u = this.parseURL(url);
//     if (!u) {
//       // 直接将*替换为正则
//       return url.replace(/\*/g, ".*");
//     }
//     switch (u.scheme) {
//       case "*":
//         u.scheme = ".+?";
//         break;
//       case "http*":
//         u.scheme = "http[s]?";
//         break;
//       default:
//     }
//     u.host = u.host.replace(/\*/g, "[^/]*?");
//     // 处理 *.开头
//     if (u.host.startsWith("[^/]*?.")) {
//       u.host = `([^/]*?\\.?)${u.host.substring(7)}`;
//     }
//     // 处理顶域
//     if (u.host.endsWith("tld")) {
//       u.host = `${u.host.substring(0, u.host.length - 3)}.*?`;
//     }
//     // 处理端口
//     const pos2 = u.host.indexOf(":");
//     if (pos2 === -1) {
//       u.host = `${u.host}(:\\d+)?`;
//     } else {
//       const port = u.host.substring(pos2 + 1);
//       if (port === "*") {
//         u.host = `${u.host.substring(0, pos2)}(:\\d+)?`;
//       } else {
//         u.host = `${u.host.substring(0, pos2)}(:${port})?`;
//       }
//     }
//     let re = `^${u.scheme}://${u.host}`;
//     if (u.path === "/") {
//       re += "[/]?";
//     } else {
//       re += u.path.replace(/\*/g, ".*?");
//     }
//     if (u.search) {
//       re += u.search.replace(/([\\?])/g, "\\$1").replace(/\*/g, ".*?");
//     }
//     return `${re.replace(/\//g, "/")}$`;
//   }

//   private addRegex(reString: string, uuid: T) {
//     let rule = this.rule.get(reString);
//     if (!rule) {
//       rule = [];
//       this.rule.set(reString, rule);
//     }
//     rule.push(uuid);
//     this.kv.set(getId(uuid), uuid);
//     this.delCache();
//   }

//   public add(reString1: string, uuid: T) {
//     let reString;
//     // 判断是不是一个正则
//     if (reString1.startsWith("/^") || reString1.endsWith("$/")) {
//       // 删除开头和结尾的/
//       if (reString1.startsWith("/")) {
//         reString1 = reString1.substring(1);
//       }
//       if (reString1.endsWith("/")) {
//         reString1 = reString1.substring(0, reString1.length - 1);
//       }
//       this.addRegex(reString1, uuid);
//       reString = reString1;
//     } else {
//       const reString2 = this.compileReString(reString1);
//       if (!reString2) {
//         console.warn("add failed: bad rule", { url: reString1, val: uuid });
//         return;
//       }
//       reString = reString2;
//     }
//     this.addRegex(reString, uuid);
//   }

//   private _match(url: string): T[] {
//     let ret = this.cache.get(url);
//     if (ret) {
//       return ret;
//     }
//     ret = [];
//     this.rule.forEach((val, reString) => {
//       try {
//         const re = new RegExp(reString);
//         if (re.test(url) && ret) {
//           ret.push(...val);
//         }
//       } catch (e) {
//         console.warn("match failed: bad rule", { val }, Logger.E(e));
//         // LoggerCore.getLogger({ component: "match" }).warn(
//         //   "bad match rule",
//         //   Logger.E(e)
//         // );
//       }
//     });
//     this.cache.set(url, ret);
//     return ret;
//   }

//   private _del(val: T) {
//     const id = getId(val);
//     this.rule.forEach((rules, reString) => {
//       const tmp: T[] = [];
//       rules.forEach((rule) => {
//         if (getId(rule) !== id) {
//           tmp.push(rule);
//         }
//       });
//       if (tmp) {
//         this.rule.set(reString, tmp);
//       } else {
//         this.rule.delete(reString);
//       }
//     });
//     this.delCache();
//   }

//   private delCache() {
//     this.cache.clear();
//   }

//   public sort(compareFn: ((a: T, b: T) => number) | undefined) {
//     this.delCache();
//     this.rule.forEach((rules) => {
//       rules.sort(compareFn);
//     });
//   }

//   protected excludeMatch = new Match<T>();

//   public exclude(url: string, uuid: T) {
//     this.excludeMatch.add(url, uuid);
//   }

//   public del(uuid: T): void {
//     this._del(uuid);
//     this.excludeMatch.del(uuid);
//     this.cache.clear();
//   }

//   public match(url: string): T[] {
//     const cache = this.cache.get(url);
//     if (cache) {
//       return cache;
//     }
//     let ret = this._match(url);
//     // 排除
//     const includeMap = new Map();
//     ret.forEach((val) => {
//       includeMap.set(getId(val), val);
//     });
//     const exclude = this.excludeMatch.match(url);
//     const excludeMap = new Map();
//     exclude.forEach((val) => {
//       excludeMap.set(getId(val), 1);
//     });
//     ret = [];
//     includeMap.forEach((val: T, key) => {
//       if (!excludeMap.has(key)) {
//         ret.push(val);
//       }
//     });
//     this.cache.set(url, ret);
//     return ret;
//   }
// }

// export interface PatternMatchesUrl {
//   scheme: string;
//   host: string;
//   path: string;
// }
