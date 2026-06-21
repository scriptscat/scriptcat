import { i18nName } from "@App/locales/locales";
import type { ScriptLoading } from "@App/pages/store/features/script";

// 可点击表头排序的列（与 release/v1.4 一致：启用状态、名称、更新时间；new-ui 无 # 序号列，未排序即自然顺序）
export type SortKey = "status" | "name" | "updatetime";
export type SortOrder = "asc" | "desc";
export type SortState = { key: SortKey | null; order: SortOrder };

/**
 * 点击表头时计算下一个排序状态：未激活列 → 升序；升序 → 降序；降序 → 关闭（回到自然顺序）。
 */
export function nextSortState(current: SortState, key: SortKey): SortState {
  if (current.key !== key) return { key, order: "asc" };
  if (current.order === "asc") return { key, order: "desc" };
  return { key: null, order: "asc" };
}

const comparators: Record<SortKey, (a: ScriptLoading, b: ScriptLoading) => number> = {
  status: (a, b) => a.status - b.status,
  name: (a, b) => i18nName(a).localeCompare(i18nName(b)),
  updatetime: (a, b) => (a.updatetime ?? 0) - (b.updatetime ?? 0),
};

/**
 * 按当前排序状态返回排序后的新数组；key 为 null 时原样返回（保持拖拽排序的自然顺序）。
 * 取反比较器实现降序，保证相等元素的稳定顺序。
 */
export function sortScriptList(list: ScriptLoading[], state: SortState): ScriptLoading[] {
  if (state.key === null) return list;
  const cmp = comparators[state.key];
  const dir = state.order === "asc" ? 1 : -1;
  return [...list].sort((a, b) => dir * cmp(a, b));
}

/** 按当前数组顺序更新自然排序编号，不修改输入对象。 */
export function reindexScriptList(list: ScriptLoading[]): ScriptLoading[] {
  return list.map((script, sort) => (script.sort === sort ? script : { ...script, sort }));
}
