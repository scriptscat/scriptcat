import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CheckSquare, Settings2, Trash2, TriangleAlert } from "lucide-react";
import type { TrashScript } from "@App/app/repo/trash_script";
import type { InstallSource } from "@App/app/service/service_worker/types";
import { requestTrashScripts, requestRestoreScripts, requestPurgeScripts } from "@App/pages/store/features/script";
import { notify } from "@App/pages/components/ui/toast";
import { useSystemConfig } from "@App/pages/options/hooks/useSystemConfig";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { EmptyState } from "@App/pages/components/ui/empty-state";
import { Checkbox } from "@App/pages/components/ui/checkbox";
import {
  MobileActionSheet,
  MobileActionSheetItem,
  MobileBatchBar,
  MobileBatchBarButton,
  MobileListRow,
  MobileListRowLeading,
  MobileListRowMain,
  MobileListRowTrailing,
  MobileSelectionHeader,
  MobileSwipeRow,
  useLongPress,
} from "@App/pages/components/ui/mobile-list";
import { semTime } from "@App/locales/relative-date";
import { versionDisplay } from "@App/pages/utils";
import { subscribeMessage } from "@App/pages/store/global";
import { HookManager } from "@App/pkg/utils/hookManager";
import type { TDeleteScript, TInstallScript } from "@App/app/service/queue";
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

type SourceFilter = "all" | "user" | "sync" | "subscribe";

const FILTERS: { value: SourceFilter; key: string }[] = [
  { value: "all", key: "script:trash_filter_all" },
  { value: "user", key: "script:trash_source_local" },
  { value: "sync", key: "script:trash_source_other_device" },
  { value: "subscribe", key: "script:trash_source_subscribe" },
];

export default function TrashListMobile({
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [retentionDays] = useSystemConfig("trash_retention_days");
  const [trashEnabled] = useSystemConfig("trash_enabled");

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
    return list.filter(
      (item) =>
        (sourceFilter === "all" || item.deleteBy === sourceFilter) &&
        (!kw || item.name.toLowerCase().includes(kw) || item.namespace.toLowerCase().includes(kw))
    );
  }, [list, sourceFilter, keyword]);

  const allSelected = visible.length > 0 && visible.every((item) => selected.has(item.uuid));

  // 左滑是隐藏手势，单条还原/彻底删除还需要一条可见入口（与脚本、订阅两页一致）
  const [sheetUuid, setSheetUuid] = useState<string | null>(null);
  const [pendingPurge, setPendingPurge] = useState<TrashScript | null>(null);
  const sheetItem = sheetUuid ? (visible.find((i) => i.uuid === sheetUuid) ?? null) : null;

  // 同时只允许一行滑开：否则多行会各自挂着「彻底删除」块
  const [swipeOpenUuid, setSwipeOpenUuid] = useState<string | null>(null);
  const handleSwipeOpenChange = useCallback(
    (uuid: string, open: boolean) => setSwipeOpenUuid((prev) => (open ? uuid : prev === uuid ? null : prev)),
    []
  );

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelected(new Set());
  }, []);

  const enterSelection = useCallback((uuid: string) => {
    setSelectionMode(true);
    setSelected(new Set([uuid]));
  }, []);

  const toggleSelect = useCallback((uuid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }, []);

  // 同上：条目在多选期间被别的窗口清空时退回普通视图
  if (selectionMode && visible.length > 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <MobileSelectionHeader
          selectedCount={selected.size}
          allSelected={allSelected}
          onCancel={exitSelection}
          onToggleSelectAll={() => setSelected(allSelected ? new Set() : new Set(visible.map((item) => item.uuid)))}
        />
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
          {visible.map((item) => (
            <TrashRowMobile
              key={item.uuid}
              item={item}
              daysLeft={daysLeftOf(item)}
              swipeOpen={swipeOpenUuid === item.uuid}
              onSwipeOpenChange={handleSwipeOpenChange}
              onOpenActions={setSheetUuid}
              selectionMode
              selected={selected.has(item.uuid)}
              onToggleSelect={toggleSelect}
              onEnterSelection={enterSelection}
              onRestore={onRestore}
              onPurge={onPurge}
            />
          ))}
        </div>
        <MobileBatchBar>
          <MobileBatchBarButton
            onClick={() => {
              void onRestore([...selected]);
              exitSelection();
            }}
          >
            {t("script:trash_restore")}
          </MobileBatchBarButton>
          <Popconfirm
            description={t("script:trash_purge_confirm_body", { count: selected.size })}
            destructive
            confirmText={t("script:trash_purge")}
            cancelText={t("editor:cancel")}
            onConfirm={() => {
              void onPurge([...selected]);
              exitSelection();
            }}
          >
            <MobileBatchBarButton destructive>{t("script:trash_purge")}</MobileBatchBarButton>
          </Popconfirm>
        </MobileBatchBar>
      </div>
    );
  }

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
        <div className="flex-1" />
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 whitespace-nowrap px-2.5 py-1 text-xs border rounded-sm border-border text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!visible.length}
          onClick={() => setSelectionMode(true)}
        >
          <CheckSquare className="w-3 h-3" />
          {t("script:multi_select")}
        </button>
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

      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        {!list.length ? (
          <EmptyState icon={Trash2} title={t("script:trash_empty_title")} description={emptyDesc} />
        ) : (
          visible.map((item) => (
            <TrashRowMobile
              key={item.uuid}
              item={item}
              daysLeft={daysLeftOf(item)}
              swipeOpen={swipeOpenUuid === item.uuid}
              onSwipeOpenChange={handleSwipeOpenChange}
              onOpenActions={setSheetUuid}
              selectionMode={false}
              selected={false}
              onToggleSelect={toggleSelect}
              onEnterSelection={enterSelection}
              onRestore={onRestore}
              onPurge={onPurge}
            />
          ))
        )}
      </div>

      {sheetItem && (
        <MobileActionSheet
          open
          onOpenChange={(open) => !open && setSheetUuid(null)}
          title={sheetItem.name}
          description={[sheetItem.namespace, versionDisplay(sheetItem.metadata?.version?.[0])]
            .filter(Boolean)
            .join(" · ")}
          icon={<ScriptIcon name={sheetItem.name} metadata={sheetItem.metadata} />}
        >
          <MobileActionSheetItem onSelect={() => void onRestore([sheetItem.uuid])}>
            {t("script:trash_restore")}
          </MobileActionSheetItem>
          {/* 面板关闭会连带销毁挂在面板项上的气泡确认，故彻底删除走列表级的模态 */}
          <MobileActionSheetItem destructive onSelect={() => setPendingPurge(sheetItem)}>
            {t("script:trash_purge")}
          </MobileActionSheetItem>
        </MobileActionSheet>
      )}

      <AlertDialog open={pendingPurge !== null} onOpenChange={(open) => !open && setPendingPurge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("script:trash_purge")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingPurge && t("script:trash_purge_one_confirm", { name: pendingPurge.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("editor:cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => pendingPurge && void onPurge([pendingPurge.uuid])}>
              {t("script:trash_purge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ========== 单行 ==========
function TrashRowMobile({
  item,
  daysLeft,
  swipeOpen,
  onSwipeOpenChange,
  onOpenActions,
  selectionMode,
  selected,
  onToggleSelect,
  onEnterSelection,
  onRestore,
  onPurge,
}: {
  item: TrashScript;
  daysLeft: number | null;
  swipeOpen: boolean;
  onSwipeOpenChange: (uuid: string, open: boolean) => void;
  onOpenActions: (uuid: string) => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (uuid: string) => void;
  onEnterSelection: (uuid: string) => void;
  onRestore: (uuids: string[]) => Promise<void>;
  onPurge: (uuids: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const urgent = daysLeft !== null && daysLeft <= 3;
  const longPress = useLongPress(useCallback(() => onEnterSelection(item.uuid), [onEnterSelection, item.uuid]));

  return (
    <MobileSwipeRow
      open={swipeOpen}
      onOpenChange={(open) => onSwipeOpenChange(item.uuid, open)}
      {...(selectionMode ? {} : longPress)}
      actions={
        <>
          <button
            type="button"
            onClick={() => void onRestore([item.uuid])}
            className="flex w-16 items-center justify-center bg-primary text-xs font-medium text-primary-foreground"
          >
            {t("script:trash_restore")}
          </button>
          <Popconfirm
            description={t("script:trash_purge_one_confirm", { name: item.name })}
            destructive
            confirmText={t("script:trash_purge")}
            cancelText={t("editor:cancel")}
            onConfirm={() => void onPurge([item.uuid])}
          >
            <button
              type="button"
              className="flex w-16 items-center justify-center bg-destructive text-xs font-medium text-destructive-foreground"
            >
              {t("script:trash_purge")}
            </button>
          </Popconfirm>
        </>
      }
    >
      <MobileListRow selected={selected}>
        <MobileListRowLeading className="gap-2">
          {selectionMode ? (
            <Checkbox aria-label={item.name} checked={selected} onCheckedChange={() => onToggleSelect(item.uuid)} />
          ) : (
            <ScriptIcon name={item.name} metadata={item.metadata} />
          )}
        </MobileListRowLeading>

        <MobileListRowMain onClick={() => (selectionMode ? onToggleSelect(item.uuid) : onOpenActions(item.uuid))}>
          <span className="w-full truncate text-sm font-medium text-muted-foreground">{item.name}</span>
          <span className="flex w-full min-w-0 items-center gap-1.5">
            <span className="truncate text-[11px] text-muted-foreground">
              {[item.namespace, versionDisplay(item.metadata?.version?.[0])].filter(Boolean).join(" · ")}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{semTime(new Date(item.deleteTime))}</span>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t(sourceKeyOf(item.deleteBy))}
            </span>
          </span>
        </MobileListRowMain>

        {/* 右锚区放过期倒计时而非开关：回收站条目没有启用态，倒计时才是这里唯一的紧迫信息 */}
        <MobileListRowTrailing>
          {daysLeft === null ? (
            <span className="text-[11px] text-muted-foreground">{"—"}</span>
          ) : (
            <span
              className={`flex items-center gap-1 text-[11px] ${urgent ? "font-semibold text-destructive" : "text-muted-foreground"}`}
            >
              {urgent && <TriangleAlert className="w-3 h-3 shrink-0" />}
              {daysLeft <= 0 ? t("script:trash_expire_today") : t("script:trash_expire_in", { days: daysLeft })}
            </span>
          )}
        </MobileListRowTrailing>
      </MobileListRow>
    </MobileSwipeRow>
  );
}
