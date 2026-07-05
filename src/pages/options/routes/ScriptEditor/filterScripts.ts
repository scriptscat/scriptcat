import type { Script } from "@App/app/repo/scripts";
import { i18nName } from "@App/locales/locales";

// 编辑器脚本列表：不分类型，按 sort 升序的扁平列表，可按关键词过滤
export function filterScripts(scripts: Script[], keyword: string): Script[] {
  const kw = keyword.trim().toLowerCase();
  const filtered = kw ? scripts.filter((s) => i18nName(s).toLowerCase().includes(kw)) : scripts;
  return [...filtered].sort((a, b) => a.sort - b.sort);
}
