import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Logger } from "@App/app/repo/logger";
import { systemConfig } from "@App/pages/store/global";
import { fetchLogs, requestClearLogs, requestDeleteLogs } from "@App/pages/store/features/log";
import {
  presetRange,
  REFRESH_INTERVAL_MS,
  type LogCondition,
  type LogQuery,
  type RefreshInterval,
  type TimePreset,
} from "./logic";

const DEFAULT_PRESET: TimePreset = "24h";

/** 解析脚本「查看日志」深链携带的 query 参数为初始标签过滤条件 */
function parseInitialQueries(raw: string | null): LogQuery[] {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (q): q is { key: string; condition?: string; value?: unknown } => !!q && typeof q.key === "string" && !!q.key
      )
      .map((q) => ({ key: q.key, condition: (q.condition as LogCondition) || "=", value: `${q.value ?? ""}` }));
  } catch {
    return [];
  }
}

export interface LogRange {
  start: number;
  end: number;
}

/** 日志页面数据管理：按时间范围加载日志、读写清理周期、删除/清空 */
export function useLogger() {
  const [searchParams] = useSearchParams();
  const initialQueries = useMemo(() => parseInitialQueries(searchParams.get("query")), [searchParams]);

  const [preset, setPreset] = useState<TimePreset | null>(DEFAULT_PRESET);
  const [range, setRange] = useState<LogRange>(() => presetRange(DEFAULT_PRESET, Date.now()));
  // endTime 是否锁定为「至今」
  const [isNow, setIsNow] = useState(true);
  const [logs, setLogs] = useState<Logger[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleanCycle, setCleanCycleState] = useState(7);
  // 自动刷新间隔；off 为关闭
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>("off");

  const load = useCallback((r: LogRange) => {
    setLoading(true);
    return fetchLogs(r.start, r.end).then((list) => {
      setLogs(list);
      setLoading(false);
      return list;
    });
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  useEffect(() => {
    systemConfig.getLogCleanCycle().then((v) => setCleanCycleState(v));
  }, []);

  // 刷新：锁定「至今」时把结束时间推进到当前再查询，否则按当前范围重查
  const reload = useCallback(() => {
    if (isNow && preset) {
      setRange(presetRange(preset, Date.now()));
    } else {
      load(range);
    }
  }, [isNow, preset, range, load]);

  // 自动刷新：按所选间隔重新拉取日志（锁定「至今」时把结束时间推进到当前）
  useEffect(() => {
    if (refreshInterval === "off") return undefined;
    const timer = setInterval(reload, REFRESH_INTERVAL_MS[refreshInterval]);
    return () => clearInterval(timer);
  }, [refreshInterval, reload]);

  const clearLogs = useCallback(async () => {
    await requestClearLogs();
    setLogs([]);
  }, []);

  const deleteLogs = useCallback(async (ids: number[]) => {
    await requestDeleteLogs(ids);
    const set = new Set(ids);
    setLogs((prev) => prev.filter((l) => !set.has(l.id)));
  }, []);

  const setCleanCycle = useCallback((val: number) => {
    setCleanCycleState(val);
    systemConfig.setLogCleanCycle(val);
  }, []);

  return {
    logs,
    loading,
    reload,
    clearLogs,
    deleteLogs,
    cleanCycle,
    setCleanCycle,
    refreshInterval,
    setRefreshInterval,
    preset,
    setPreset,
    range,
    setRange,
    isNow,
    setIsNow,
    initialQueries,
  };
}
