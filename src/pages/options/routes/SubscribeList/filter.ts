import type { SubscribeStatusType } from "@App/app/repo/subscribe";
import type { SubscribeLoading } from "@App/pages/store/features/subscribe";

export type SubscribeSortField = "createtime" | "name" | "updatetime";
export type SortOrder = "asc" | "desc";
export interface SubscribeSort {
  field: SubscribeSortField;
  order: SortOrder;
}

export interface SubscribeFilterOptions {
  statusFilter: SubscribeStatusType | null;
  keyword: string;
  sort: SubscribeSort | null;
}

/**
 * 对订阅列表依次应用：状态筛选 → 名称搜索（不区分大小写子串）→ 排序。
 * 纯函数，不修改入参数组。
 */
export function filterAndSortSubscribes(
  list: SubscribeLoading[],
  { statusFilter, keyword, sort }: SubscribeFilterOptions
): SubscribeLoading[] {
  let result = list;

  if (statusFilter !== null) {
    result = result.filter((s) => s.status === statusFilter);
  }

  const kw = keyword.trim().toLowerCase();
  if (kw) {
    result = result.filter((s) => s.name.toLowerCase().includes(kw));
  }

  if (sort) {
    const dir = sort.order === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      let cmp: number;
      if (sort.field === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sort.field === "updatetime") {
        cmp = (a.updatetime || 0) - (b.updatetime || 0);
      } else {
        cmp = a.createtime - b.createtime;
      }
      return cmp * dir;
    });
  }

  return result;
}
