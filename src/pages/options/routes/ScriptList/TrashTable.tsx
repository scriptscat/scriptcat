import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { RotateCcw, Settings2, Trash2, TriangleAlert } from "lucide-react";
import type { TrashScript } from "@App/app/repo/trash_script";
import type { InstallSource } from "@App/app/service/service_worker/types";
import { requestTrashScripts, requestRestoreScripts, requestPurgeScripts } from "@App/pages/store/features/script";
import { notify } from "@App/pages/components/ui/toast";
import { useSystemConfig } from "@App/pages/options/hooks/useSystemConfig";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { SearchInput } from "@App/pages/components/ui/search-input";
import {
  ListRow,
  ListRowActions,
  ListRowLeading,
  ListRowMain,
  ListRowTrailing,
} from "@App/pages/components/ui/list-row";
import { SortMenu } from "./SortMenu";
import type { SortOrder } from "./sort";
import { semTime } from "@App/locales/relative-date";
import { versionDisplay } from "@App/pages/utils";
import { subscribeMessage } from "@App/pages/store/global";
import { HookManager } from "@App/pkg/utils/hookManager";
import type { TDeleteScript, TInstallScript } from "@App/app/service/queue";
import SelectionBar, { SelectionBarButton } from "./SelectionBar";
import { ScriptIcon } from "./components";
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

type TrashSortKey = "deleteTime" | "name";

const TRASH_COMPARATORS: Record<TrashSortKey, (a: TrashScript, b: TrashScript) => number> = {
  deleteTime: (a, b) => a.deleteTime - b.deleteTime,
  name: (a, b) => a.name.localeCompare(b.name),
};

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
  const navigate = useNavigate();
  const [list, setList] = useState<TrashScript[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [purgeAllOpen, setPurgeAllOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [keyword, setKeyword] = useState("");
  // 回收站默认按删除时间倒序：最近删掉的最可能是误删，应当最先看到
  const [sortState, setSortState] = useState<{ key: TrashSortKey | null; order: SortOrder }>({
    key: "deleteTime",
    order: "desc",
  });
  const [retentionDays] = useSystemConfig("trash_retention_days");
  const [trashEnabled] = useSystemConfig("trash_enabled");

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
    void reload();
    const hooks = new HookManager();
    hooks.append(
      subscribeMessage<TDeleteScript[]>("trashScripts", () => void reload()),
      subscribeMessage<TDeleteScript[]>("deleteScripts", () => void reload()),
      subscribeMessage<TInstallScript>("installScript", () => void reload())
    );
    return hooks.unhook;
  }, [reload]);

  const configuredDays = retentionDays ?? 30;
  // 关闭回收站后残留条目不再自动清理，倒计时须归零，否则会倒数一个永远不会到来的期限
  const days = (trashEnabled ?? true) ? configuredDays : 0;

  // days=0 有两种含义（关闭 / 永不清理），空状态说明须分别措辞，不能插值出「保留 0 天」
  const emptyDesc = !(trashEnabled ?? true)
    ? t("script:trash_hint_disabled")
    : days
      ? t("script:trash_empty_desc", { days })
      : t("script:trash_empty_desc_never");

  const daysLeftOf = useCallback(
    (item: TrashScript) => (days ? Math.ceil((item.deleteTime + days * DAY - Date.now()) / DAY) : null),
    [days]
  );

  const onRestore = useCallback(
    async (uuids: string[]) => {
      try {
        const ret = await requestRestoreScripts(uuids);
        if (ret) {
          for (const c of ret.conflicts) {
            notify.error(t("script:trash_restore_conflict", { name: c.name }));
          }
          if (ret.restored.length) {
            notify.success(t("script:trash_restore_success", { count: ret.restored.length }));
          }
        }
      } catch {
        // 条目可能已被其他窗口或到期清理抢先处理(SW 抛 trash scripts not found);失败也要重拉列表清掉陈旧行
        notify.error(t("script:trash_undo_failed"));
      }
      await reload();
    },
    [reload, t]
  );

  const onPurge = useCallback(
    async (uuids: string[]) => {
      try {
        await requestPurgeScripts(uuids);
        notify.success(t("script:trash_purge_success", { count: uuids.length }));
      } catch {
        notify.error(t("script:delete_failed"));
      }
      await reload();
    },
    [reload, t]
  );

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const filtered = list.filter(
      (item) =>
        (sourceFilter === "all" || item.deleteBy === sourceFilter) &&
        (!kw || item.name.toLowerCase().includes(kw) || item.namespace.toLowerCase().includes(kw))
    );
    if (sortState.key === null) return filtered;
    const cmp = TRASH_COMPARATORS[sortState.key];
    const dir = sortState.order === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => dir * cmp(a, b));
  }, [list, sourceFilter, keyword, sortState]);

  const allSelected = useMemo(
    () => visible.length > 0 && visible.every((item) => selected.has(item.uuid)),
    [visible, selected]
  );

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏：tabs + 搜索 + 清空回收站（与已安装 tab 共用同一条 h-14 顶栏的形状） */}
      <div className="flex items-center gap-4 h-14 px-6 shrink-0 bg-card">
        {leading}
        <SearchInput
          className="flex-1 rounded-lg"
          inputClassName="text-[13px]"
          aria-label={t("script:trash_search_placeholder")}
          placeholder={t("script:trash_search_placeholder")}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <SortMenu
          options={[
            { key: "deleteTime" as TrashSortKey, label: t("script:trash_col_time") },
            { key: "name" as TrashSortKey, label: t("name") },
          ]}
          value={sortState}
          onChange={setSortState}
        />
        <button
          className="flex items-center gap-1.5 h-8 px-4 text-[13px] font-medium border rounded-md shrink-0 border-destructive text-destructive disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!list.length}
          onClick={() => setPurgeAllOpen(true)}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t("script:trash_empty_all")}
        </button>
      </div>

      {/* 批量操作栏撑开时把筛选行顶出这个 h-11 窗口（与已安装列表同构） */}
      <div className="h-11 shrink-0 overflow-hidden contain-layout">
        <SelectionBar
          selectedCount={selected.size}
          allSelected={allSelected}
          onToggleSelectAll={() => setSelected(allSelected ? new Set() : new Set(visible.map((i) => i.uuid)))}
          onClose={() => setSelected(new Set())}
        >
          <SelectionBarButton color="primary" onClick={() => void onRestore([...selected])}>
            <RotateCcw className="w-3 h-3" />
            {t("script:trash_restore")}
          </SelectionBarButton>
          <Popconfirm
            description={t("script:trash_purge_confirm_body", { count: selected.size })}
            destructive
            confirmText={t("script:trash_purge")}
            cancelText={t("editor:cancel")}
            onConfirm={() => void onPurge([...selected])}
          >
            <SelectionBarButton color="destructive">
              <Trash2 className="w-3 h-3" />
              {t("script:trash_purge")}
            </SelectionBarButton>
          </Popconfirm>
        </SelectionBar>

        {/* 筛选行：来源 chips + 右侧保留提示 */}
        <div className="flex h-11 shrink-0 items-center gap-2 px-6 border-b border-border bg-card">
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
            {!(trashEnabled ?? true)
              ? t("script:trash_hint_disabled")
              : days
                ? t("script:trash_hint", { days })
                : t("script:trash_hint_never")}
          </span>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            <Settings2 className="size-3" />
            {t("settings")}
          </button>
        </div>
      </div>

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

        <div className="flex-1 overflow-y-auto">
          {!list.length ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                <Trash2 className="size-7 text-muted-foreground" />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-base font-semibold text-foreground">{t("script:trash_empty_title")}</span>
                <span className="max-w-[380px] text-center text-sm text-muted-foreground">{emptyDesc}</span>
              </div>
            </div>
          ) : (
            visible.map((item) => {
              const left = daysLeftOf(item);
              const urgent = left !== null && left <= 3;
              return (
                <ListRow key={item.uuid} selected={selected.has(item.uuid)}>
                  <ListRowLeading className="w-8 justify-center">
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
                  </ListRowLeading>

                  <ListRowMain>
                    <ScriptIcon name={item.name} metadata={item.metadata} />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-muted-foreground">{item.name}</span>
                      {/* 删除来源由原来的固定列降级为元信息行的行内徽章 */}
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[11px] text-muted-foreground">
                          {[item.namespace, versionDisplay(item.metadata?.version?.[0])].filter(Boolean).join(" · ")}
                        </span>
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t(sourceKeyOf(item.deleteBy))}
                        </span>
                      </span>
                    </div>
                  </ListRowMain>

                  <ListRowTrailing className="gap-3">
                    <div className="flex w-[104px] items-center gap-1.5">
                      {left === null ? (
                        <span className="text-xs text-muted-foreground">{"—"}</span>
                      ) : (
                        <>
                          {urgent && <TriangleAlert className="w-3 h-3 text-destructive" />}
                          <span
                            className={`text-xs ${urgent ? "font-medium text-destructive" : "text-muted-foreground"}`}
                          >
                            {left <= 0 ? t("script:trash_expire_today") : t("script:trash_expire_in", { days: left })}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex w-[120px] justify-end text-xs text-muted-foreground">
                      {semTime(new Date(item.deleteTime))}
                    </div>
                  </ListRowTrailing>

                  <ListRowActions>
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
                  </ListRowActions>
                </ListRow>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
