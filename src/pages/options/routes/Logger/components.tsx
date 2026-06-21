import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Calendar as CalendarIcon,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import type { TFunction } from "i18next";
import { cn } from "@App/pkg/utils/cn";
import { dayFormat, formatUnixTime } from "@App/pkg/utils/day_format";
import type { Logger } from "@App/app/repo/logger";
import { Popover, PopoverContent, PopoverTrigger } from "@App/pages/components/ui/popover";
import { Button } from "@App/pages/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@App/pages/components/ui/select";
import {
  buildMonthGrid,
  levelBucket,
  type CalendarCell,
  type LabelsMap,
  type LevelBucket,
  type LogCondition,
  type LogQuery,
  type RefreshInterval,
  type TimePreset,
} from "./logic";

/** 级别桶展示顺序 */
export const LEVEL_BUCKETS: LevelBucket[] = ["error", "warn", "info", "debug"];

/** 各级别桶的配色类（左侧色条 / 文字 / 圆点 / 徽标底色） */
const LEVEL_META: Record<LevelBucket, { bar: string; text: string; dot: string; badge: string }> = {
  error: { bar: "border-l-destructive", text: "text-destructive", dot: "bg-destructive", badge: "bg-destructive/10" },
  warn: { bar: "border-l-warning", text: "text-warning-fg", dot: "bg-warning", badge: "bg-warning-bg" },
  info: { bar: "border-l-success", text: "text-success-fg", dot: "bg-success", badge: "bg-success-bg" },
  debug: {
    bar: "border-l-muted-foreground",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
    badge: "bg-muted",
  },
};

const CONDITIONS: LogCondition[] = ["=", "=~", "!=", "!~"];

/** 快捷范围分组（分钟 / 小时 / 天），用于统一时间选择器弹层 */
const PRESET_GROUPS: { labelKey: string; presets: TimePreset[] }[] = [
  { labelKey: "group_minutes", presets: ["5m", "15m", "30m"] },
  { labelKey: "group_hours", presets: ["1h", "3h", "6h", "12h", "24h"] },
  { labelKey: "group_days", presets: ["7d"] },
];

/** 自动刷新可选间隔展示顺序 */
const REFRESH_INTERVALS: RefreshInterval[] = ["off", "5s", "10s", "30s", "1m", "5m"];

const INTERVAL_I18N: Record<RefreshInterval, string> = {
  off: "refresh_off",
  "5s": "interval_5s",
  "10s": "interval_10s",
  "30s": "interval_30s",
  "1m": "interval_1m",
  "5m": "interval_5m",
};

/** 自动刷新间隔的本地化文案 */
export function getIntervalLabel(interval: RefreshInterval, t: TFunction): string {
  return t(`logs:${INTERVAL_I18N[interval]}`);
}

const PRESET_I18N: Record<TimePreset, string> = {
  "5m": "last_5_minutes",
  "15m": "last_15_minutes",
  "30m": "last_30_minutes",
  "1h": "last_1_hour",
  "3h": "last_3_hours",
  "6h": "last_6_hours",
  "12h": "last_12_hours",
  "24h": "last_24_hours",
  "7d": "last_7_days",
};

/** 级别徽标：圆点 + 大写级别名 */
function LevelBadge({ bucket }: { bucket: LevelBucket }) {
  const m = LEVEL_META[bucket];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold",
        m.badge,
        m.text
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", m.dot)} />
      {bucket.toUpperCase()}
    </span>
  );
}

/** 把日志组装成可读的详情 JSON */
function detailJson(log: Logger): string {
  return JSON.stringify(
    { time: formatUnixTime(log.createtime / 1000), level: log.level, message: log.message, ...log.label },
    null,
    2
  );
}

/** 单条日志（控制台风格）：时间 + 级别徽标 + 消息 + 标签 chips，左侧级别色条；可展开看完整标签。
 *  桌面端单行(消息截断)；移动端竖向堆叠(时间/级别一行，消息整段换行)。 */
export function LogRow({
  log,
  expanded,
  onToggle,
  mobile = false,
}: {
  log: Logger;
  expanded: boolean;
  onToggle: () => void;
  mobile?: boolean;
}) {
  const bucket = levelBucket(log.level);
  const m = LEVEL_META[bucket];
  const labelChips = Object.entries(log.label).filter(([, v]) => typeof v === "string" || typeof v === "number") as [
    string,
    string | number,
  ][];

  return (
    <div className={cn("border-b border-border border-l-4", m.bar, expanded && "bg-primary-light/50")}>
      <button
        type="button"
        data-testid={`log-row-${log.id}`}
        onClick={onToggle}
        className={cn(
          "w-full text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
          mobile ? "flex flex-col gap-1.5 px-4 py-2.5" : "flex items-center gap-3 px-4 py-2"
        )}
      >
        {mobile ? (
          <>
            <span className="flex items-center gap-2.5">
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {dayFormat(new Date(log.createtime), "HH:mm:ss")}
              </span>
              <LevelBadge bucket={bucket} />
              <span className="flex-1" />
              <ChevronRight
                className={cn(
                  "w-3.5 h-3.5 shrink-0 text-muted-foreground/60 transition-transform",
                  expanded && "rotate-90"
                )}
              />
            </span>
            <span className="break-words whitespace-pre-wrap font-mono text-[13px] text-foreground">{log.message}</span>
            {labelChips.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                {labelChips.slice(0, 4).map(([k, v]) => (
                  <span key={k} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-fg-secondary">
                    {`${k}:${v}`}
                  </span>
                ))}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {dayFormat(new Date(log.createtime), "HH:mm:ss")}
            </span>
            <span className="shrink-0 w-[74px]">
              <LevelBadge bucket={bucket} />
            </span>
            <span className="flex-1 min-w-0 truncate font-mono text-[13px] text-foreground">{log.message}</span>
            {labelChips.length > 0 && (
              <span className="hidden md:flex items-center gap-1.5 shrink-0">
                {labelChips.slice(0, 4).map(([k, v]) => (
                  <span key={k} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-fg-secondary">
                    {`${k}:${v}`}
                  </span>
                ))}
              </span>
            )}
            <ChevronRight
              className={cn(
                "w-3.5 h-3.5 shrink-0 text-muted-foreground/60 transition-transform",
                expanded && "rotate-90"
              )}
            />
          </>
        )}
      </button>
      {expanded && (
        <div data-testid={`log-detail-${log.id}`} className="px-5 pb-3">
          <pre className="overflow-x-auto scrollbar-custom whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 p-3 font-mono text-xs text-fg-secondary">
            {detailJson(log)}
          </pre>
        </div>
      )}
    </div>
  );
}

/** 「全部」级别 chip */
export function AllChip({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "border-transparent bg-primary-light text-primary"
          : "border-border text-muted-foreground hover:bg-accent"
      )}
    >
      {t("logs:all_levels")}
    </button>
  );
}

/** 单个级别筛选 chip：圆点 + 级别名 + 数量，可切换 */
export function LevelChip({
  bucket,
  count,
  active,
  onToggle,
}: {
  bucket: LevelBucket;
  count: number;
  active: boolean;
  onToggle: () => void;
}) {
  const m = LEVEL_META[bucket];
  return (
    <button
      type="button"
      data-testid={`level-chip-${bucket}`}
      onClick={onToggle}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
        active ? cn("border-transparent", m.badge, m.text) : "border-border text-muted-foreground hover:bg-accent"
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", active ? m.dot : "bg-muted-foreground/40")} />
      {bucket.toUpperCase()}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

/** 分段式刷新控件：手动刷新 + 自动刷新间隔（关闭 / 5s…5m） */
export function RefreshControl({
  interval,
  onRefresh,
  onIntervalChange,
}: {
  interval: RefreshInterval;
  onRefresh: () => void;
  onIntervalChange: (i: RefreshInterval) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = interval !== "off";
  return (
    <div
      className={cn(
        "inline-flex h-8 items-center rounded-md border",
        active ? "border-primary/50 bg-primary-light" : "border-input bg-card"
      )}
    >
      <button
        type="button"
        data-testid="refresh-button"
        aria-label={t("logs:refresh")}
        onClick={onRefresh}
        className={cn(
          "flex h-full items-center px-2.5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
          active ? "text-primary" : "text-fg-secondary"
        )}
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
      <span className={cn("h-4 w-px", active ? "bg-primary/30" : "bg-border")} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="interval-trigger"
            className={cn(
              "flex h-full items-center gap-1.5 px-2.5 text-[13px] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
              active ? "font-medium text-primary" : "text-fg-secondary"
            )}
          >
            {t(`logs:${INTERVAL_I18N[interval]}`)}
            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-36 p-1">
          {REFRESH_INTERVALS.map((i) => (
            <button
              key={i}
              type="button"
              data-testid={`interval-option-${i}`}
              onClick={() => {
                onIntervalChange(i);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                i === interval ? "bg-primary-light font-medium text-primary" : "text-foreground hover:bg-accent"
              )}
            >
              {t(`logs:${INTERVAL_I18N[i]}`)}
              {i === interval && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function clampInt(raw: string, min: number, max: number): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** 时/分/秒数字输入框 */
function TimeInput({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={`${value}`.padStart(2, "0")}
      onChange={(e) => onChange(clampInt(e.target.value, 0, max))}
      className="h-7 w-9 rounded-md border border-input bg-input/40 text-center font-mono text-[13px] tabular-nums text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    />
  );
}

/** 月历 + 时分秒：选择具体日期时间，保留原值的时间部分 */
export function Calendar({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const { t } = useTranslation();
  const [view, setView] = useState(() => ({ year: value.getFullYear(), month: value.getMonth() }));
  const weeks = buildMonthGrid(view.year, view.month);
  const weekdays = t("logs:weekdays_short").split(",");

  const pickDay = (cell: CalendarCell) => {
    const d = new Date(cell.date);
    d.setHours(value.getHours(), value.getMinutes(), value.getSeconds(), 0);
    onChange(d);
  };
  const setTime = (h: number, m: number, s: number) => {
    const d = new Date(value);
    d.setHours(h, m, s, 0);
    onChange(d);
  };
  const shiftMonth = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  return (
    <div className="w-[252px]">
      <div className="flex items-center justify-between pb-1">
        <button
          type="button"
          aria-label={t("logs:prev_month")}
          onClick={() => shiftMonth(-1)}
          className="flex size-7 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">
          {t("logs:year_month", { year: view.year, month: view.month + 1 })}
        </span>
        <button
          type="button"
          aria-label={t("logs:next_month")}
          onClick={() => shiftMonth(1)}
          className="flex size-7 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7">
        {weekdays.map((w) => (
          <div key={w} className="flex h-7 items-center justify-center text-xs text-muted-foreground">
            {w}
          </div>
        ))}
        {weeks.flat().map((cell, idx) => {
          const selected =
            cell.inMonth &&
            cell.day === value.getDate() &&
            view.month === value.getMonth() &&
            view.year === value.getFullYear();
          return (
            <button
              key={idx}
              type="button"
              data-testid={cell.inMonth ? `calendar-day-${cell.day}` : undefined}
              onClick={() => pickDay(cell)}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                selected
                  ? "bg-primary-background font-semibold text-primary-foreground"
                  : cell.inMonth
                    ? "text-foreground hover:bg-accent"
                    : "text-muted-foreground hover:bg-accent"
              )}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <span className="text-xs text-fg-secondary">{t("logs:time")}</span>
        <div className="flex items-center gap-1">
          <TimeInput
            value={value.getHours()}
            max={23}
            onChange={(h) => setTime(h, value.getMinutes(), value.getSeconds())}
          />
          <span className="text-muted-foreground">{":"}</span>
          <TimeInput
            value={value.getMinutes()}
            max={59}
            onChange={(m) => setTime(value.getHours(), m, value.getSeconds())}
          />
          <span className="text-muted-foreground">{":"}</span>
          <TimeInput
            value={value.getSeconds()}
            max={59}
            onChange={(s) => setTime(value.getHours(), value.getMinutes(), s)}
          />
        </div>
      </div>
    </div>
  );
}

/** 「从/到」日期时间输入：点击展开日历选择器 */
function DateTimeField({ value, onChange, testid }: { value: Date; onChange: (d: Date) => void; testid: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testid}
          className="flex w-full items-center gap-2 rounded-md border border-input bg-input/50 px-2.5 py-2 text-left transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <CalendarIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <span className="font-mono text-[13px] text-foreground">{dayFormat(value, "YYYY-MM-DD HH:mm")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <Calendar value={value} onChange={onChange} />
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={() => onChange(new Date())}>
            {t("logs:now")}
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            {t("confirm")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 统一时间范围选择器：触发按钮自显当前范围；弹层左=快捷范围分组、右=绝对起止 */
export function TimeRangePicker({
  preset,
  range,
  isNow,
  onSelectPreset,
  onApplyRange,
}: {
  preset: TimePreset | null;
  range: { start: number; end: number };
  isNow: boolean;
  onSelectPreset: (p: TimePreset) => void;
  onApplyRange: (start: number, end: number) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => new Date(range.start));
  const [to, setTo] = useState(() => new Date(range.end));
  // 外部范围变化时同步草稿（如选择了快捷范围）：渲染期比较上一个值再 setState
  const [prevRange, setPrevRange] = useState({ start: range.start, end: range.end });
  if (prevRange.start !== range.start || prevRange.end !== range.end) {
    setPrevRange({ start: range.start, end: range.end });
    setFrom(new Date(range.start));
    setTo(new Date(range.end));
  }

  const label =
    preset && isNow
      ? t(`logs:${PRESET_I18N[preset]}`)
      : `${dayFormat(new Date(range.start), "MM-DD HH:mm")} → ${dayFormat(new Date(range.end), "MM-DD HH:mm")}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="time-range-trigger"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-secondary/50 px-2.5 text-[13px] text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <CalendarClock className="w-3.5 h-3.5 text-muted-foreground" />
          {label}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex">
          <div className="w-44 border-r border-border p-2">
            <div className="px-1 pb-1.5 text-[11px] font-semibold text-muted-foreground">{t("logs:quick_range")}</div>
            <div className="flex flex-col gap-2">
              {PRESET_GROUPS.map((g) => (
                <div key={g.labelKey} className="flex flex-col gap-0.5">
                  <div className="px-1 text-[11px] text-muted-foreground">{t(`logs:${g.labelKey}`)}</div>
                  {g.presets.map((p) => {
                    const activeP = preset === p && isNow;
                    return (
                      <button
                        key={p}
                        type="button"
                        data-testid={`quick-range-${p}`}
                        onClick={() => {
                          onSelectPreset(p);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex items-center justify-between rounded-sm px-2 py-1.5 text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                          activeP ? "bg-primary-light font-medium text-primary" : "text-fg-secondary hover:bg-accent"
                        )}
                      >
                        {t(`logs:${PRESET_I18N[p]}`)}
                        {activeP && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex w-64 flex-col gap-3 p-3">
            <div className="text-[11px] font-semibold text-muted-foreground">{t("logs:absolute_range")}</div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-fg-secondary">{t("logs:from_start")}</span>
              <DateTimeField value={from} onChange={setFrom} testid="from-field" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-secondary">{t("logs:to_end")}</span>
                <button
                  type="button"
                  onClick={() => setTo(new Date())}
                  className="rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary-light/80 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {t("logs:now")}
                </button>
              </div>
              <DateTimeField value={to} onChange={setTo} testid="to-field" />
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">{t("logs:auto_refresh_hint")}</p>
            <Button
              size="sm"
              data-testid="apply-range"
              onClick={() => {
                const s = from.getTime();
                const e = to.getTime();
                onApplyRange(Math.min(s, e), Math.max(s, e));
                setOpen(false);
              }}
            >
              {t("logs:apply_range")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 单条标签筛选 chip：key / 条件 / value 三个下拉 + 删除 */
function LabelQueryChip({
  query,
  labelsMap,
  onChange,
  onRemove,
}: {
  query: LogQuery;
  labelsMap: LabelsMap;
  onChange: (q: LogQuery) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const keys = Object.keys(labelsMap);
  const values = Object.keys(labelsMap[query.key] || {});
  const selectCls = "h-6 border-0 bg-transparent px-1.5 font-mono text-xs shadow-none focus-visible:ring-0";
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-secondary/40 py-0.5 pl-1 pr-0.5">
      <Select value={query.key || undefined} onValueChange={(v) => onChange({ ...query, key: v, value: "" })}>
        <SelectTrigger className={selectCls}>
          <SelectValue placeholder="key" />
        </SelectTrigger>
        <SelectContent>
          {keys.map((k) => (
            <SelectItem key={k} value={k}>
              {k}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={query.condition} onValueChange={(v) => onChange({ ...query, condition: v as LogCondition })}>
        <SelectTrigger className={cn(selectCls, "font-semibold text-primary")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONDITIONS.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={query.value || undefined} onValueChange={(v) => onChange({ ...query, value: v })}>
        <SelectTrigger className={selectCls}>
          <SelectValue placeholder="value" />
        </SelectTrigger>
        <SelectContent>
          {values.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("common:delete")}
        className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

/** 高级标签筛选条 */
export function LabelFilterBar({
  queries,
  labelsMap,
  onChange,
  onAdd,
  onRemove,
}: {
  queries: LogQuery[];
  labelsMap: LabelsMap;
  onChange: (index: number, q: LogQuery) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">{t("logs:label_filter")}</span>
      {queries.map((q, i) => (
        <LabelQueryChip
          key={i}
          query={q}
          labelsMap={labelsMap}
          onChange={(nq) => onChange(i, nq)}
          onRemove={() => onRemove(i)}
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-fg-secondary transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Plus className="w-3 h-3" />
        {t("logs:add_label")}
      </button>
    </div>
  );
}
