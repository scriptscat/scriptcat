import { isUrlMatch, extractUrlPatterns, RuleTypeBit, type URLRuleEntry } from "./url_matcher";
import { randNum } from "./utils";

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

  public urlMatch(url: string): T[] {
    const cacheMap = this.cacheMap;
    if (cacheMap.has(url)) return cacheMap.get(url) as T[];
    const s = new Set<T>();
    for (const [uuid, rules] of this.rulesMap.entries()) {
      if (urlMatch(url, rules)) {
        s.add(uuid);
      }
    }
    const res = [...s];
    const sorter = this.sorter;
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
    cacheMap.set(url, res);
    return res;
  }

  public clearRules(uuid: T) {
    this.cacheMap.clear();
    this.rulesMap.delete(uuid);
  }

  // 测试用
  public addInclude(rulePattern: string, uuid: T) {
    // @include xxxxx
    const rules = extractUrlPatterns([rulePattern].map((e) => `@include ${e}`));
    this.addRules(uuid, rules);
  }

  // 测试用
  public addMatch(rulePattern: string, uuid: T) {
    // @match xxxxx
    const rules = extractUrlPatterns([rulePattern].map((e) => `@match ${e}`));
    this.addRules(uuid, rules);
  }

  // 测试用
  public exclude(rulePattern: string, uuid: T) {
    // @exclude xxxxx
    const rules = extractUrlPatterns([rulePattern].map((e) => `@exclude ${e}`));
    this.addRules(uuid, rules);
  }

  public setupSorter(sorter: Partial<Record<string, number>> | null) {
    if (this.sorter !== sorter) {
      this.cacheMap.clear();
      this.sorter = sorter;
    }
  }
}

export function urlMatch(url: string, rules: URLRuleEntry[]): boolean {
  let ruleIncluded = false;
  for (const rule of rules) {
    if (rule.ruleType & RuleTypeBit.INCLUSION) {
      // include
      if (!ruleIncluded && isUrlMatch(url, rule)) {
        ruleIncluded = true;
      }
    } else {
      // exclude
      if (!isUrlMatch(url, rule)) {
        return false;
      }
    }
  }
  return ruleIncluded;
}

// 是否是被排除的 URL
export function urlExclude(url: string, rules: URLRuleEntry[]): boolean {
  let ruleExcluded = false;
  for (const rule of rules) {
    if (!(rule.ruleType & RuleTypeBit.INCLUSION)) {
      // exclude
      if (!isUrlMatch(url, rule)) {
        ruleExcluded = true;
        break;
      }
    }
  }
  if (ruleExcluded) {
    return true;
  }
  return false;
}

export const blackListSelfCheck = (blacklist: string[] | null | undefined) => {
  blacklist = blacklist || [];

  const scriptUrlPatterns = extractUrlPatterns([...blacklist.map((e) => `@include ${e}`)]);
  const blackMatch = new UrlMatch<string>();
  blackMatch.addRules("BK", scriptUrlPatterns);

  for (const line of blacklist) {
    const templateLine = line.replace(/[*?]/g, (a) => {
      // ?: 置换成１个英文字母
      if (a === "?") return String.fromCharCode(randNum(97, 122));
      // *: 置换成３～５个英文字母
      const s = [];
      for (let i = randNum(3, 5); i > 0; i--) {
        s.push(randNum(97, 122));
      }
      return String.fromCharCode(...s);
    });
    if (blackMatch.urlMatch(templateLine)[0] !== "BK") {
      // 无效的复合规则
      // 生成的字串不能被匹对、例如正则表达式
      return { ok: false, line };
    }
  }
  // 有效的复合规则
  // 只包含 match pattern 及 glob pattern
  return { ok: true };
};
