import type { ScriptCode } from "@App/app/repo/scripts";
import type { SearchType } from "@App/app/service/service_worker/types";
import { requestFilterResult } from "@App/pages/store/features/script";

export type SearchFilterKeyEntry = { type: SearchType; keyword: string };
export type SearchFilterRequest = { type: SearchType; keyword: string }; // 两个Type日后可能会不同。先分开写。
export type SearchFilterResponse = ScriptCode | undefined;
export type SearchFilterKeysSetter = (filterKeys: SearchFilterKeyEntry[], callback?: (...args: any[]) => any) => void;

let lastReqType: SearchType | undefined = undefined;
let lastKeyword: string = "";
let lastResponse: ScriptCode | undefined = undefined;
const searchFilterCache: Map<string, any> = new Map();

export class SearchFilter {
  constructor() {}
  requestFilterResult(req: SearchFilterRequest): void {
    if (req.keyword === lastKeyword) {
      lastReqType = req.type;
      this.onResponse(req, lastResponse);
    } else {
      requestFilterResult({ value: req.keyword }).then((res) => {
        lastReqType = req.type;
        lastKeyword = req.keyword;
        lastResponse = res;
        searchFilterCache.clear();
        if (res && Array.isArray(res)) {
          for (const entry of res) {
            searchFilterCache.set(entry.uuid, {
              code: entry.code,
              name: entry.name,
              auto: entry.auto,
            });
          }
        }
        this.onResponse(req, res);
      });
    }
  }
  onResponse(_req: SearchFilterRequest, _res: SearchFilterResponse): void {
    // placeholder
  }
  checkByUUID(uuid: string): boolean {
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
