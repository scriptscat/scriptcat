import { useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Inbox, Loader2, ScrollText, Search, Trash, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@App/pkg/utils/cn";
import { t } from "@App/locales/locales";
import { formatUnixTime } from "@App/pkg/utils/day_format";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { Button } from "@App/pages/components/ui/button";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { useLogger } from "./hooks";
import {
  aggregateLabels,
  countLevels,
  filterLogs,
  presetRange,
  type LevelBucket,
  type LogQuery,
  type TimePreset,
} from "./logic";
import {
  AllChip,
  getIntervalLabel,
  LabelFilterBar,
  LEVEL_BUCKETS,
  LevelChip,
  LogRow,
  RefreshControl,
  TimeRangePicker,
} from "./components";

export default function Logger() {
  const isMobile = useIsMobile();
  const {
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
  } = useLogger();

  const [queries, setQueries] = useState<LogQuery[]>(initialQueries);
  const [search, setSearch] = useState("");
  const [activeLevels, setActiveLevels] = useState<Set<LevelBucket>>(() => new Set(LEVEL_BUCKETS));
  const [advancedOpen, setAdvancedOpen] = useState(initialQueries.length > 0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showTop, setShowTop] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  const labelsMap = useMemo(() => aggregateLabels(logs), [logs]);
  const counts = useMemo(() => countLevels(logs), [logs]);
  const messageRegex = useMemo(() => {
    if (!search) return null;
    try {
      return new RegExp(search);
    } catch {
      return null;
    }
  }, [search]);
  const filtered = useMemo(
    () => filterLogs(logs, { queries, messageRegex, activeLevels }),
    [logs, queries, messageRegex, activeLevels]
  );

  const onSelectPreset = (p: TimePreset) => {
    setPreset(p);
    setIsNow(true);
    setRange(presetRange(p, Date.now()));
  };
  const onApplyCustomRange = (start: number, end: number) => {
    setPreset(null);
    setIsNow(false);
    setRange({ start, end });
  };
  const toggleLevel = (b: LevelBucket) =>
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });

  const handleDeleteCurrent = () => {
    const ids = filtered.map((l) => l.id);
    if (!ids.length) return;
    deleteLogs(ids).then(() => toast.success(t("logs:delete_completed")));
  };
  const handleClear = () => {
    clearLogs().then(() => toast.success(t("logs:clear_completed")));
  };

  return (
    <div className="relative flex flex-col h-full">
      {/* 顶栏 */}
      <div className="flex items-center justify-between h-14 px-4 md:px-5 shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <ScrollText className="w-5 h-5 shrink-0 text-foreground" />
          <h1 className="text-base md:text-lg font-semibold text-foreground shrink-0">{t("logs:log_title")}</h1>
          <span className="truncate text-xs md:text-[13px] text-muted-foreground">
            {isMobile
              ? t("logs:filtered_count", { count: filtered.length })
              : `${t("logs:total_count", { count: logs.length })} · ${t("logs:filtered_count", { count: filtered.length })}`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isMobile ? (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("logs:delete_current_logs")}
              onClick={handleDeleteCurrent}
            >
              <Trash className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleDeleteCurrent}>
              <Trash className="w-3.5 h-3.5" />
              {t("logs:delete_current_logs")}
            </Button>
          )}
          <Popconfirm
            description={t("logs:clear_logs_confirm")}
            destructive
            confirmText={t("confirm")}
            cancelText={t("editor:cancel")}
            onConfirm={handleClear}
          >
            {isMobile ? (
              <Button variant="destructive" size="icon-sm" aria-label={t("logs:clear_logs")}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button variant="destructive" size="sm">
                <Trash2 className="w-3.5 h-3.5" />
                {t("logs:clear_logs")}
              </Button>
            )}
          </Popconfirm>
        </div>
      </div>

      {/* 筛选工具栏 */}
      <div className="flex flex-col gap-3 px-4 py-3 shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2.5 flex-wrap">
          <TimeRangePicker
            preset={preset}
            range={range}
            isNow={isNow}
            onSelectPreset={onSelectPreset}
            onApplyRange={onApplyCustomRange}
          />
          <RefreshControl interval={refreshInterval} onRefresh={reload} onIntervalChange={setRefreshInterval} />

          {/* 级别筛选条:移动端窄屏可横向滚动,避免挤压时间/刷新控件 */}
          <div
            data-testid="level-chip-bar"
            className="flex items-center gap-1.5 overflow-x-auto scrollbar-custom min-w-0 pb-0.5 md:overflow-visible md:pb-0"
          >
            <AllChip
              active={activeLevels.size === LEVEL_BUCKETS.length}
              onClick={() => setActiveLevels(new Set(LEVEL_BUCKETS))}
            />
            {LEVEL_BUCKETS.map((b) => (
              <LevelChip
                key={b}
                bucket={b}
                count={counts[b]}
                active={activeLevels.has(b)}
                onToggle={() => toggleLevel(b)}
              />
            ))}
          </div>

          <div className="hidden md:block flex-1 min-w-[80px]" />

          <div className="flex items-center gap-2 h-8 w-full md:w-[220px] rounded-md border border-input bg-secondary/50 px-2.5">
            <Search className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("logs:search_regex")}
              className="flex-1 min-w-0 bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <Button size="sm" className="flex-1 md:flex-none" onClick={reload}>
            {t("logs:query")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAdvancedOpen((o) => !o)}>
            {t("logs:advanced")}
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", advancedOpen && "rotate-180")} />
          </Button>
        </div>

        {advancedOpen && (
          <LabelFilterBar
            queries={queries}
            labelsMap={labelsMap}
            onChange={(i, q) => setQueries((prev) => prev.map((x, idx) => (idx === i ? q : x)))}
            onAdd={() => setQueries((prev) => [...prev, { key: "", condition: "=", value: "" }])}
            onRemove={(i) => setQueries((prev) => prev.filter((_, idx) => idx !== i))}
          />
        )}
      </div>

      {/* 范围 / 统计条 */}
      <div className="flex items-center justify-between gap-2 min-h-[34px] px-4 py-1 md:py-0 shrink-0 border-b border-border bg-muted/40 text-xs">
        <div className="flex items-center gap-2 min-w-0 text-fg-secondary">
          <span className="truncate font-mono">
            {`${formatUnixTime(range.start / 1000)} → ${formatUnixTime(range.end / 1000)}`}
          </span>
          {isNow && (
            <span className="rounded-full bg-primary-light px-1.5 py-0.5 text-[11px] font-medium text-primary">
              {t("logs:now")}
            </span>
          )}
          {refreshInterval !== "off" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-1.5 py-0.5 text-[11px] font-medium text-success-fg">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {`${t("logs:live")} · ${getIntervalLabel(refreshInterval)}`}
            </span>
          )}
          <span className="text-muted-foreground">{"·"}</span>
          <span className="shrink-0">
            {`${t("logs:total_count", { count: logs.length })}，${t("logs:filtered_count", { count: filtered.length })}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
          <span>{t("logs:clean_schedule")}</span>
          <input
            type="number"
            value={cleanCycle}
            onChange={(e) => setCleanCycle(parseInt(e.target.value, 10) || 0)}
            className="w-12 h-6 rounded border border-input bg-card text-center text-xs text-foreground focus:outline-none"
          />
          <span>{t("logs:days_ago_logs")}</span>
        </div>
      </div>

      {/* 日志流 */}
      <div
        ref={streamRef}
        onScroll={(e) => setShowTop(e.currentTarget.scrollTop > 200)}
        className="flex-1 min-h-0 overflow-auto scrollbar-custom bg-card"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full py-20 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-full py-20 text-muted-foreground">
            <Inbox className="w-8 h-8 opacity-50" />
            <span className="text-sm">{t("logs:no_logs")}</span>
          </div>
        ) : (
          filtered.map((log) => (
            <LogRow
              key={log.id}
              log={log}
              mobile={isMobile}
              expanded={expandedId === log.id}
              onToggle={() => setExpandedId((id) => (id === log.id ? null : log.id))}
            />
          ))
        )}
      </div>

      {/* 回到顶部 */}
      {showTop && (
        <button
          type="button"
          aria-label={t("logs:back_to_top")}
          onClick={() => streamRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
          className="absolute bottom-5 right-5 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-fg-secondary shadow-md transition-colors hover:bg-accent"
        >
          <ArrowUp className="w-[18px] h-[18px]" />
        </button>
      )}
    </div>
  );
}
