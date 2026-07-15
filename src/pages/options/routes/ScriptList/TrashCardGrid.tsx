import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FileCode, RotateCcw, Settings2, Trash2, TriangleAlert } from "lucide-react";
import type { TrashScript } from "@App/app/repo/trash_script";
import type { InstallSource } from "@App/app/service/service_worker/types";
import { requestTrashScripts, requestRestoreScripts, requestPurgeScripts } from "@App/pages/store/features/script";
import { notify } from "@App/pages/components/ui/toast";
import { useSystemConfig } from "@App/pages/options/hooks/useSystemConfig";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { EmptyState } from "@App/pages/components/ui/empty-state";
import { Surface } from "@App/pages/components/ui/surface";
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

export default function TrashCardGrid({
  keyword = "",
  onCountChange,
}: {
  keyword?: string;
  /** 回报条目数，供 tab 角标显示（彻底删除/清空只在本组件内发生，外部感知不到） */
  onCountChange?: (n: number) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [list, setList] = useState<TrashScript[]>([]);
  const [purgeAllOpen, setPurgeAllOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [retentionDays] = useSystemConfig("trash_retention_days");

  const reload = useCallback(
    () =>
      requestTrashScripts().then((l) => {
        setList(l ?? []);
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

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-4 py-1.5 overflow-x-auto shrink-0">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setSourceFilter(f.value)}
            className={`shrink-0 px-3 py-1 text-xs rounded-full border ${
              sourceFilter === f.value
                ? "bg-primary border-primary text-primary-foreground font-medium"
                : "border-border text-muted-foreground"
            }`}
          >
            {t(f.key)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 px-4 pb-1.5 shrink-0">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {days ? t("script:trash_hint", { days }) : t("script:trash_hint_never")}
        </span>
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
        >
          <Settings2 className="size-3" />
          {t("settings")}
        </button>
        <div className="flex-1" />
        <button
          className="flex shrink-0 items-center gap-1 whitespace-nowrap px-2.5 py-1 text-xs border rounded-sm border-destructive text-destructive disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!list.length}
          onClick={() => setPurgeAllOpen(true)}
        >
          <Trash2 className="w-3 h-3" />
          {t("script:trash_empty_all")}
        </button>
      </div>

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

      <div className="flex flex-col flex-1 min-h-0 gap-2.5 px-4 pb-4 overflow-y-auto">
        {!list.length ? (
          <EmptyState
            icon={Trash2}
            title={t("script:trash_empty_title")}
            description={t("script:trash_empty_desc", { days })}
          />
        ) : (
          visible.map((item) => {
            const left = daysLeftOf(item);
            const urgent = left !== null && left <= 3;
            return (
              <Surface key={item.uuid} className="flex flex-col gap-2 p-3.5">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate text-muted-foreground">{item.name}</span>
                  <div className="flex-1" />
                  <span className="px-2 py-0.5 text-[10px] font-medium rounded-full shrink-0 bg-muted text-muted-foreground">
                    {t(sourceKeyOf(item.deleteBy))}
                  </span>
                </div>
                <span className="text-xs truncate text-muted-foreground">{item.namespace}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(item.deleteTime).toLocaleDateString()}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{"·"}</span>
                  {urgent && <TriangleAlert className="w-3 h-3 shrink-0 text-destructive" />}
                  <span
                    className={`text-[11px] ${urgent ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                  >
                    {left === null
                      ? t("script:trash_hint_never")
                      : left <= 0
                        ? t("script:trash_expire_today")
                        : t("script:trash_expire_in", { days: left })}
                  </span>
                  <div className="flex-1" />
                  <button
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] border rounded-sm border-primary text-primary"
                    onClick={() => void onRestore([item.uuid])}
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t("script:trash_restore")}
                  </button>
                  <Popconfirm
                    description={t("script:trash_purge_one_confirm", { name: item.name })}
                    destructive
                    confirmText={t("script:trash_purge")}
                    cancelText={t("editor:cancel")}
                    onConfirm={() => void onPurge([item.uuid])}
                  >
                    <button className="p-1.5 rounded-sm" title={t("script:trash_purge")}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </Popconfirm>
                </div>
              </Surface>
            );
          })
        )}
      </div>
    </div>
  );
}
