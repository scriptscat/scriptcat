import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import type { TrashScript } from "@App/app/repo/trash_script";
import type { InstallSource } from "@App/app/service/service_worker/types";
import { requestTrashScripts, requestRestoreScripts, requestPurgeScripts } from "@App/pages/store/features/script";
import { notify } from "@App/pages/components/ui/toast";
import { useSystemConfig } from "@App/pages/options/hooks/useSystemConfig";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { SearchInput } from "@App/pages/components/ui/search-input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@App/pages/components/ui/alert-dialog";

const DAY = 24 * 60 * 60 * 1000;

const SOURCE_KEY: Record<string, string> = {
  user: "script:trash_source_local",
  sync: "script:trash_source_other_device",
  subscribe: "script:trash_source_subscribe",
};

const sourceKeyOf = (deleteBy: InstallSource) => SOURCE_KEY[deleteBy] ?? "script:trash_source_other";

type SourceFilter = "all" | "user" | "sync" | "subscribe";

const FILTERS: { value: SourceFilter; key: string }[] = [
  { value: "all", key: "script:trash_filter_all" },
  { value: "user", key: "script:trash_source_local" },
  { value: "sync", key: "script:trash_source_other_device" },
  { value: "subscribe", key: "script:trash_source_subscribe" },
];

export default function TrashTable({
  leading,
  onCountChange,
}: {
  leading?: React.ReactNode;
  /** 回报条目数，供顶栏 tab 角标显示（彻底删除/清空只在本组件内发生，外部感知不到） */
  onCountChange?: (n: number) => void;
}) {
  const { t } = useTranslation();
  const [list, setList] = useState<TrashScript[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [purgeAllOpen, setPurgeAllOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [retentionDays] = useSystemConfig("trash_retention_days");

  const reload = useCallback(
    () =>
      requestTrashScripts().then((l) => {
        setList(l ?? []);
        setSelected(new Set());
        onCountChange?.(l?.length ?? 0);
      }),
    [onCountChange]
  );

  // setState 只发生在异步回调中，避免 effect 体内同步 setState（同 Logger/hooks.ts 的既有写法）
  useEffect(() => {
    void requestTrashScripts().then((l) => setList(l ?? []));
  }, []);

  const days = retentionDays ?? 30;

  const daysLeftOf = useCallback(
    (item: TrashScript) => (days ? Math.ceil((item.deleteTime + days * DAY - Date.now()) / DAY) : null),
    [days]
  );

  const onRestore = useCallback(
    async (uuids: string[]) => {
      const ret = await requestRestoreScripts(uuids);
      if (!ret) return;
      for (const c of ret.conflicts) {
        notify.error(t("script:trash_restore_conflict", { name: c.name }));
      }
      if (ret.restored.length) {
        notify.success(t("script:trash_restore_success", { count: ret.restored.length }));
      }
      await reload();
    },
    [reload, t]
  );

  const onPurge = useCallback(
    async (uuids: string[]) => {
      await requestPurgeScripts(uuids);
      notify.success(t("script:trash_purge_success", { count: uuids.length }));
      await reload();
    },
    [reload, t]
  );

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return list.filter(
      (item) =>
        (sourceFilter === "all" || item.deleteBy === sourceFilter) &&
        (!kw || item.name.toLowerCase().includes(kw) || item.namespace.toLowerCase().includes(kw))
    );
  }, [list, sourceFilter, keyword]);

  const allSelected = useMemo(
    () => visible.length > 0 && visible.every((item) => selected.has(item.uuid)),
    [visible, selected]
  );

  // 大空状态只看未筛选的总数：筛选后为空时若也显示「回收站是空的」，会让用户误以为脚本已经没了。
  // 注意仍要渲染带 tabs 的顶栏，否则回收站为空时用户就没有切回「已安装」的入口了。
  if (!list.length) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-4 h-14 px-6 shrink-0 border-b border-border bg-card">{leading}</div>
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
            <Trash2 className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-base font-semibold text-foreground">{t("script:trash_empty_title")}</span>
            <span className="text-sm text-center text-muted-foreground max-w-[380px]">
              {t("script:trash_empty_desc", { days })}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏：tabs + 搜索 + 清空回收站（与已安装 tab 共用同一条 h-14 顶栏的形状） */}
      <div className="flex items-center gap-4 h-14 px-6 shrink-0 border-b border-border bg-card">
        {leading}
        <SearchInput
          className="flex-1 rounded-lg"
          inputClassName="text-[13px]"
          aria-label={t("script:trash_search_placeholder")}
          placeholder={t("script:trash_search_placeholder")}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button
          className="flex items-center gap-1.5 h-8 px-4 text-[13px] font-medium border rounded-md shrink-0 border-destructive text-destructive"
          onClick={() => setPurgeAllOpen(true)}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t("script:trash_empty_all")}
        </button>
      </div>

      {/* 筛选行：来源 chips + 右侧保留提示 */}
      <div className="flex items-center h-11 gap-2 px-6 shrink-0 border-b border-border">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setSourceFilter(f.value)}
            className={`px-3 py-0.5 text-xs rounded-full border ${
              sourceFilter === f.value
                ? "bg-primary border-primary text-primary-foreground font-medium"
                : "border-border text-muted-foreground"
            }`}
          >
            {t(f.key)}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {days ? t("script:trash_hint", { days }) : t("script:trash_hint_never")}
        </span>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center h-11 gap-3 px-6 text-xs shrink-0 bg-accent">
          <span className="font-medium text-primary">{t("script:trash_selected", { count: selected.size })}</span>
          <div className="flex-1" />
          <button
            className="flex items-center gap-1.5 px-3 py-1 border rounded-md border-primary text-primary"
            onClick={() => void onRestore([...selected])}
          >
            <RotateCcw className="w-3 h-3" />
            {t("script:trash_restore")}
          </button>
          <Popconfirm
            description={t("script:trash_purge_confirm_body", { count: selected.size })}
            destructive
            confirmText={t("script:trash_purge")}
            cancelText={t("editor:cancel")}
            onConfirm={() => void onPurge([...selected])}
          >
            <button className="flex items-center gap-1.5 px-3 py-1 border rounded-md border-destructive text-destructive">
              <Trash2 className="w-3 h-3" />
              {t("script:trash_purge")}
            </button>
          </Popconfirm>
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0 px-6 pb-6">
        <AlertDialog open={purgeAllOpen} onOpenChange={setPurgeAllOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("script:trash_purge_confirm_title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("script:trash_purge_confirm_body", { count: list.length })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-sm bg-destructive/10">
              <TriangleAlert className="w-3.5 h-3.5 shrink-0 text-destructive" />
              <span className="text-xs font-medium text-destructive">{t("script:trash_purge_confirm_warn")}</span>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("editor:cancel")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void onPurge(list.map((i) => i.uuid))}>
                {t("script:trash_purge")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex items-center h-10 px-3 border-b border-border text-xs font-medium text-muted-foreground">
          <div className="flex justify-center w-8">
            <Checkbox
              checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
              onCheckedChange={(checked) => setSelected(checked ? new Set(visible.map((i) => i.uuid)) : new Set())}
            />
          </div>
          <div className="flex-1">{t("script:trash_col_name")}</div>
          <div className="w-[120px]">{t("script:trash_col_source")}</div>
          <div className="w-[150px]">{t("script:trash_col_time")}</div>
          <div className="w-[110px]">{t("script:trash_col_expire")}</div>
          <div className="w-24 text-right">{t("script:trash_col_actions")}</div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {visible.map((item) => {
            const left = daysLeftOf(item);
            const urgent = left !== null && left <= 3;
            return (
              <div key={item.uuid} className="flex items-center h-13 px-3 rounded-md hover:bg-accent">
                <div className="flex justify-center w-8">
                  <Checkbox
                    checked={selected.has(item.uuid)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selected);
                      if (checked) {
                        next.add(item.uuid);
                      } else {
                        next.delete(item.uuid);
                      }
                      setSelected(next);
                    }}
                  />
                </div>
                <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                  <span className="text-sm font-medium truncate line-through text-muted-foreground">{item.name}</span>
                  <span className="text-xs truncate text-muted-foreground">{item.namespace}</span>
                </div>
                <div className="w-[120px]">
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                    {t(sourceKeyOf(item.deleteBy))}
                  </span>
                </div>
                <div className="w-[150px] text-xs text-muted-foreground">
                  {new Date(item.deleteTime).toLocaleString()}
                </div>
                <div className="w-[110px] flex items-center gap-1.5">
                  {left === null ? (
                    <span className="text-xs text-muted-foreground">{"—"}</span>
                  ) : (
                    <>
                      {urgent && <TriangleAlert className="w-3 h-3 text-destructive" />}
                      <span className={`text-xs ${urgent ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                        {left <= 0 ? t("script:trash_expire_today") : t("script:trash_expire_in", { days: left })}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex justify-end w-24 gap-1">
                  <button
                    className="p-1.5 rounded-sm hover:bg-accent"
                    title={t("script:trash_restore")}
                    onClick={() => void onRestore([item.uuid])}
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-primary" />
                  </button>
                  <Popconfirm
                    description={t("script:trash_purge_one_confirm", { name: item.name })}
                    destructive
                    confirmText={t("script:trash_purge")}
                    cancelText={t("editor:cancel")}
                    onConfirm={() => void onPurge([item.uuid])}
                  >
                    <button className="p-1.5 rounded-sm hover:bg-accent" title={t("script:trash_purge")}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </Popconfirm>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
