import type { SearchType } from "@App/app/service/service_worker/types";
import type { SortKey, SortState } from "./sort";
import type { TSelectFilter } from "./hooks";
import type { SearchFilterRequest } from "./SearchFilter";

export const SCRIPT_LIST_VIEW_MODE_KEY = "script-list-view-mode";
export const SCRIPT_LIST_PREFERENCES_KEY = "script-list-preferences";

export type ScriptListViewMode = "table" | "card";

export type ScriptListPreferences = {
  viewMode: ScriptListViewMode;
  selectedFilters: TSelectFilter;
  searchRequest: SearchFilterRequest;
  sortState: SortState;
};

export const DEFAULT_SCRIPT_LIST_PREFERENCES: ScriptListPreferences = {
  viewMode: "table",
  selectedFilters: { status: null, type: null, tags: null, source: null },
  searchRequest: { keyword: "", type: "auto" },
  sortState: { key: null, order: "asc" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseViewMode(value: unknown): ScriptListViewMode | null {
  return value === "table" || value === "card" ? value : null;
}

function parseFilterValue(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" || value === null ? value : null;
}

function parseSelectedFilters(value: unknown): TSelectFilter {
  if (!isRecord(value)) return DEFAULT_SCRIPT_LIST_PREFERENCES.selectedFilters;
  return {
    status: parseFilterValue(value.status),
    type: parseFilterValue(value.type),
    tags: parseFilterValue(value.tags),
    source: parseFilterValue(value.source),
  };
}

function parseSearchType(value: unknown): SearchType {
  return value === "auto" || value === "name" || value === "script_code" ? value : "auto";
}

function parseSearchRequest(value: unknown): SearchFilterRequest {
  if (!isRecord(value)) return DEFAULT_SCRIPT_LIST_PREFERENCES.searchRequest;
  return {
    keyword: typeof value.keyword === "string" ? value.keyword : "",
    type: parseSearchType(value.type),
  };
}

function parseSortKey(value: unknown): SortKey | null {
  return value === "status" || value === "name" || value === "updatetime" || value === null ? value : null;
}

function parseSortState(value: unknown): SortState {
  if (!isRecord(value)) return DEFAULT_SCRIPT_LIST_PREFERENCES.sortState;
  return {
    key: parseSortKey(value.key),
    order: value.order === "desc" ? "desc" : "asc",
  };
}

export function parseScriptListPreferences(raw: string | null, legacyViewMode?: string | null): ScriptListPreferences {
  const legacy = parseViewMode(legacyViewMode);
  if (!raw) {
    return { ...DEFAULT_SCRIPT_LIST_PREFERENCES, viewMode: legacy ?? DEFAULT_SCRIPT_LIST_PREFERENCES.viewMode };
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) {
      return { ...DEFAULT_SCRIPT_LIST_PREFERENCES, viewMode: legacy ?? DEFAULT_SCRIPT_LIST_PREFERENCES.viewMode };
    }
    return {
      viewMode: parseViewMode(value.viewMode) ?? legacy ?? DEFAULT_SCRIPT_LIST_PREFERENCES.viewMode,
      selectedFilters: parseSelectedFilters(value.selectedFilters),
      searchRequest: parseSearchRequest(value.searchRequest),
      sortState: parseSortState(value.sortState),
    };
  } catch {
    return { ...DEFAULT_SCRIPT_LIST_PREFERENCES, viewMode: legacy ?? DEFAULT_SCRIPT_LIST_PREFERENCES.viewMode };
  }
}

export function readScriptListPreferences(): ScriptListPreferences {
  return parseScriptListPreferences(
    localStorage.getItem(SCRIPT_LIST_PREFERENCES_KEY),
    localStorage.getItem(SCRIPT_LIST_VIEW_MODE_KEY)
  );
}

export function writeScriptListPreferences(preferences: ScriptListPreferences): void {
  localStorage.setItem(SCRIPT_LIST_PREFERENCES_KEY, JSON.stringify(preferences));
  localStorage.setItem(SCRIPT_LIST_VIEW_MODE_KEY, preferences.viewMode);
}
