import React, { useCallback } from "react";
import { Search, Loader2, ChevronUp, ChevronDown, ChevronsUpDown, ListFilter, Check, Inbox } from "lucide-react";
import { SubscribeStatusType } from "@App/app/repo/subscribe";
import { requestEnableSubscribe, type SubscribeLoading } from "@App/pages/store/features/subscribe";
import { cn } from "@App/pkg/utils/cn";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@App/pages/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import type { SubscribeSort, SubscribeSortField } from "./filter";
import {
  SubscribeIcon,
  SubscribeEnableSwitch,
  PermissionFavicons,
  SubscribeSourceTag,
  SubscribeUpdateTimeCell,
  SubscribeRowActions,
} from "./components";
import { versionDisplay } from "@App/pages/utils";

export interface SubscribeTableProps {
  subscribeList: SubscribeLoading[];
  loadingList: boolean;
  updateSubscribes: (urls: string[], data: Partial<SubscribeLoading>) => void;
  handleDelete: (subscribe: SubscribeLoading) => void;
  searchKeyword: string;
  setSearchKeyword: (kw: string) => void;
  totalCount: number;
  sort: SubscribeSort | null;
  onSort: (field: SubscribeSortField) => void;
  statusFilter: SubscribeStatusType | null;
  setStatusFilter: (v: SubscribeStatusType | null) => void;
}

// ========== 可排序表头 ==========
function SortHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: SubscribeSortField;
  sort: SubscribeSort | null;
  onSort: (field: SubscribeSortField) => void;
}) {
  const active = sort?.field === field;
  const Icon = active ? (sort!.order === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        "inline-flex items-center gap-1 transition-colors hover:text-foreground",
        active && "text-foreground"
      )}
    >
      <span>{label}</span>
      <Icon className={cn("w-3 h-3", !active && "opacity-40")} />
    </button>
  );
}

// ========== 状态筛选表头 ==========
function StatusFilterHeader({
  statusFilter,
  setStatusFilter,
}: {
  statusFilter: SubscribeStatusType | null;
  setStatusFilter: (v: SubscribeStatusType | null) => void;
}) {
  const { t } = useTranslation();
  const options: { value: SubscribeStatusType | null; label: string }[] = [
    { value: null, label: t("script:script_list.sidebar.all") },
    { value: SubscribeStatusType.enable, label: t("enable") },
    { value: SubscribeStatusType.disable, label: t("disable") },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 transition-colors hover:text-foreground",
            statusFilter !== null && "text-primary"
          )}
        >
          <span>{t("script:script_list.sidebar.status")}</span>
          <ListFilter className="w-3 h-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-32">
        {options.map((o) => (
          <DropdownMenuItem
            key={String(o.value)}
            onClick={() => setStatusFilter(o.value)}
            className="flex items-center gap-2"
          >
            <Check className={cn("w-3.5 h-3.5", statusFilter === o.value ? "opacity-100" : "opacity-0")} />
            <span>{o.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function SubscribeTable({
  subscribeList,
  loadingList,
  updateSubscribes,
  handleDelete,
  searchKeyword,
  setSearchKeyword,
  totalCount,
  sort,
  onSort,
  statusFilter,
  setStatusFilter,
}: SubscribeTableProps) {
  const { t } = useTranslation();
  const handleEnable = useCallback(
    (subscribe: SubscribeLoading, checked: boolean) => {
      updateSubscribes([subscribe.url], { enableLoading: true });
      // 订阅服务端不广播状态变更，成功后在页面侧乐观写回 status；失败则回滚并提示
      requestEnableSubscribe({ url: subscribe.url, enable: checked })
        .then(() =>
          updateSubscribes([subscribe.url], {
            status: checked ? SubscribeStatusType.enable : SubscribeStatusType.disable,
            enableLoading: false,
          })
        )
        .catch((e) => {
          updateSubscribes([subscribe.url], { enableLoading: false });
          notify.error(`${t("script:operation_failed")}: ${e}`);
        });
    },
    [updateSubscribes, t]
  );

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏：标题 + 数量 + 搜索 */}
      <div className="flex items-center gap-4 h-14 px-6 shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2 shrink-0">
          <h1 className="text-base font-semibold">{t("script:subscribe")}</h1>
          <span className="inline-flex items-center rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium font-mono text-primary tabular-nums">
            {totalCount}
          </span>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2 rounded-lg bg-muted px-3 h-9">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            className="flex-1 min-w-0 bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
            placeholder={t("script:enter_subscribe_name")}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
        </div>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto scrollbar-custom px-6 pb-6">
        {/* 表头 */}
        <div className="flex items-center h-10 px-3 text-xs font-medium text-muted-foreground border-b border-border sticky top-0 bg-background z-10 min-w-[820px]">
          <div className="w-10 flex justify-center">
            <SortHeader label="#" field="createtime" sort={sort} onSort={onSort} />
          </div>
          <div className="w-16 flex justify-center">
            <StatusFilterHeader statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
          </div>
          <div className="flex-1 min-w-0">
            <SortHeader label={t("name")} field="name" sort={sort} onSort={onSort} />
          </div>
          <div className="w-[110px] text-center">{t("version")}</div>
          <div className="w-[140px] text-center">{t("permission:permission")}</div>
          <div className="w-[110px] text-center">{t("source")}</div>
          <div className="w-[150px] flex justify-center">
            <SortHeader label={t("logs:last_updated")} field="updatetime" sort={sort} onSort={onSort} />
          </div>
          <div className="w-[80px] text-right">{t("action")}</div>
        </div>

        {/* 加载状态 */}
        {loadingList && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">{t("loading")}</span>
          </div>
        )}

        {/* 空状态：居中图标 + 标题 + 说明（对齐 DESIGN.md §9） */}
        {!loadingList && subscribeList.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Inbox className="w-10 h-10 text-muted-foreground/60" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">{t("no_subscribes")}</p>
              <p className="text-xs text-muted-foreground">{t("no_subscribes_hint")}</p>
            </div>
          </div>
        )}

        {/* 订阅行 */}
        {!loadingList &&
          subscribeList.length > 0 &&
          subscribeList.map((subscribe, index) => (
            <SubscribeRow
              key={subscribe.url}
              index={index}
              subscribe={subscribe}
              onEnable={handleEnable}
              onDelete={handleDelete}
            />
          ))}
      </div>
    </div>
  );
}

// ========== 订阅行 ==========
interface SubscribeRowProps {
  index: number;
  subscribe: SubscribeLoading;
  onEnable: (subscribe: SubscribeLoading, checked: boolean) => void;
  onDelete: (subscribe: SubscribeLoading) => void;
}

function SubscribeRowInner({ index, subscribe, onEnable, onDelete }: SubscribeRowProps) {
  const { t } = useTranslation();
  const isDisabled = subscribe.status === SubscribeStatusType.disable;
  const version = subscribe.metadata.version?.[0] || "0.0";
  const scriptCount = Object.keys(subscribe.scripts || {}).length;
  const subtitle = [t("script:subscribe_scripts_count", { count: scriptCount }), subscribe.author]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "group/row flex items-center h-[52px] px-3 rounded-lg transition-colors hover:bg-primary/[0.08] min-w-[820px]",
        isDisabled && "opacity-60"
      )}
    >
      {/* 序号 */}
      <div className="w-10 flex justify-center text-xs text-muted-foreground tabular-nums">{index + 1}</div>

      {/* 开关 */}
      <div className="w-16 flex justify-center">
        <SubscribeEnableSwitch
          status={subscribe.status}
          enableLoading={subscribe.enableLoading}
          onCheckedChange={(checked) => onEnable(subscribe, checked)}
        />
      </div>

      {/* 名称 + 元信息 */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        <SubscribeIcon name={subscribe.name} />
        <div className="min-w-0 flex flex-col gap-px">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm font-medium truncate">{subscribe.name}</span>
            </TooltipTrigger>
            <TooltipContent>{subscribe.name}</TooltipContent>
          </Tooltip>
          <span className="text-[11px] text-muted-foreground truncate">{subtitle}</span>
        </div>
      </div>

      {/* 版本 */}
      <div className="w-[110px] flex justify-center text-xs font-mono text-fg-secondary">{versionDisplay(version)}</div>

      {/* 权限 */}
      <div className="w-[140px] flex justify-center">
        <PermissionFavicons connect={subscribe.metadata.connect} />
      </div>

      {/* 来源 */}
      <div className="w-[110px] flex justify-center">
        <SubscribeSourceTag url={subscribe.url} />
      </div>

      {/* 最后更新 */}
      <div className="w-[150px] flex justify-center">
        <SubscribeUpdateTimeCell url={subscribe.url} updatetime={subscribe.updatetime} />
      </div>

      {/* 操作 */}
      <SubscribeRowActions
        onDelete={() => onDelete(subscribe)}
        className="w-[80px] justify-end opacity-[0.55] group-hover/row:opacity-100"
      />
    </div>
  );
}

const SubscribeRow = React.memo(SubscribeRowInner, (prev, next) => {
  return (
    prev.index === next.index &&
    prev.subscribe.url === next.subscribe.url &&
    prev.subscribe.status === next.subscribe.status &&
    prev.subscribe.enableLoading === next.subscribe.enableLoading &&
    prev.subscribe.actionLoading === next.subscribe.actionLoading &&
    prev.subscribe.updatetime === next.subscribe.updatetime
  );
});
