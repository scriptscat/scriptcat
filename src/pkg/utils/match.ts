import { isUrlMatch, extractMUP, RuleTypeBit, type URLRuleEntry } from "./url_matcher";
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
      let ruleIncluded = false;
      let ruleExcluded = false;
      for (const rule of rules) {
        if (rule.ruleType & RuleTypeBit.INCLUSION) {
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

  public clearRules(uuid: T) {
    this.cacheMap.clear();
    this.rulesMap.delete(uuid);
  }

  // 測試用
  public addInclude(rulePattern: string, uuid: T) {
    // @include xxxxx
    const rules = extractMUP([rulePattern].map((e) => `@include ${e}`));
    this.addRules(uuid, rules);
  }

  // 測試用
  public addMatch(rulePattern: string, uuid: T) {
    // @match xxxxx
    const rules = extractMUP([rulePattern].map((e) => `@match ${e}`));
    this.addRules(uuid, rules);
  }

  // 測試用
  public exclude(rulePattern: string, uuid: T) {
    // @exclude xxxxx
    const rules = extractMUP([rulePattern].map((e) => `@exclude ${e}`));
    this.addRules(uuid, rules);
  }

  public setupSorter(sorter: Partial<Record<string, number>>) {
    this.cacheMap.clear();
    this.sorter = sorter;
  }
}

export const blackListSelfCheck = (blacklist: string[] | null | undefined) => {
  blacklist = blacklist || [];

  const scriptMUP = extractMUP([...blacklist.map((e) => `@include ${e}`)]);
  const blackMatch = new UrlMatch<string>();
  blackMatch.addRules("BK", scriptMUP);

  for (const line of blacklist) {
    const templateLine = line.replace(/[*?]/g, (a) => {
      // ?: 置換成一個英文字母
      if (a === "?") return String.fromCharCode(randNum(97, 122));
      // *: 置換成三～五個英文字母
      const s = [];
      for (let i = randNum(3, 5); i > 0; i--) {
        s.push(randNum(97, 122));
      }
      return String.fromCharCode(...s);
    });
    if (blackMatch.urlMatch(templateLine)[0] !== "BK") {
      // 生成的字串不能被匹對
      return {ok: false, line};
    }
  }
  return {ok: true};
}
