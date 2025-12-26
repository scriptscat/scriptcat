import type { SearchType } from "@App/app/service/service_worker/types";
import { requestFilterResult } from "@App/pages/store/features/script";

export type SearchFilterKeyEntry = { type: SearchType; keyword: string };
export type SearchFilterRequest = { type: SearchType; keyword: string; bySelect?: boolean }; // 两个Type日后可能会不同。先分开写。

// 静态变量不随重绘重置
let lastReqType: SearchType | undefined = undefined;
let lastKeyword: string = "";
type SearchFilterCacheEntry = { code: boolean; name: boolean; auto: boolean };
const searchFilterCache: Map<string, SearchFilterCacheEntry> = new Map();

export class SearchFilter {
  static async requestFilterResult(req: SearchFilterRequest) {
    lastReqType = req.type;
    if (req.keyword !== lastKeyword) {
      lastKeyword = req.keyword;
      searchFilterCache.clear();
      if (req.keyword === "") {
        return;
      }
      const res = await requestFilterResult({ value: req.keyword });
      if (res && Array.isArray(res)) {
        for (const entry of res) {
          searchFilterCache.set(entry.uuid, {
            code: entry.code,
            name: entry.name,
            auto: entry.auto,
          });
        }
      }
    }
  }

  static checkByUUID(uuid: string): boolean {
    const result = searchFilterCache.get(uuid);
    if (!result) return false;
    switch (lastReqType) {
      case "auto":
        return result.auto;
      case "script_code":
        return result.code;
      case "name":
        return result.name;
      default:
        return false;
    }
  }
}
