import React, { useCallback } from "react";
import { ChevronDown, ListFilter, Check, Inbox } from "lucide-react";
import { SubscribeStatusType } from "@App/app/repo/subscribe";
import { requestEnableSubscribe, type SubscribeLoading } from "@App/pages/store/features/subscribe";
import { cn } from "@App/pkg/utils/cn";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";
import { EmptyState } from "@App/pages/components/ui/empty-state";
import { LoadingState } from "@App/pages/components/ui/loading-state";
import { SearchInput } from "@App/pages/components/ui/search-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@App/pages/components/ui/tooltip";
import {
  ListRow,
  ListRowActions,
  ListRowLeading,
  ListRowMain,
  ListRowTrailing,
} from "@App/pages/components/ui/list-row";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { SortMenu } from "../ScriptList/SortMenu";
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
  setSort: (sort: SubscribeSort | null) => void;
  statusFilter: SubscribeStatusType | null;
  setStatusFilter: (v: SubscribeStatusType | null) => void;
}

// ========== 状态筛选 ==========
function StatusFilterMenu({
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
  const active = options.find((o) => o.value === statusFilter) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="subscribe-status-filter"
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px]",
            statusFilter === null ? "text-foreground" : "text-primary"
          )}
        >
          <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{`${t("script:script_list.sidebar.status")}：${active.label}`}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
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
  setSort,
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
    <div data-testid="subscribe-page" className="flex flex-col h-full">
      {/* 顶栏：标题 + 数量 + 搜索 + 状态筛选 + 排序（后两者由表头迁入） */}
      <div className="flex items-center gap-4 h-14 px-6 shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2 shrink-0">
          <h1 className="text-base font-semibold">{t("script:subscribe")}</h1>
          <span className="inline-flex items-center rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium font-mono text-primary tabular-nums">
            {totalCount}
          </span>
        </div>
        <SearchInput
          className="flex-1 rounded-lg bg-muted"
          inputClassName="text-[13px]"
          aria-label={t("script:enter_subscribe_name")}
          placeholder={t("script:enter_subscribe_name")}
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
        />
        <StatusFilterMenu statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
        <SortMenu
          options={[
            { key: "createtime" as SubscribeSortField, label: t("script:sort_create_time") },
            { key: "name" as SubscribeSortField, label: t("name") },
            { key: "updatetime" as SubscribeSortField, label: t("logs:last_updated") },
          ]}
          value={{ key: sort?.field ?? null, order: sort?.order ?? "asc" }}
          onChange={(next) => setSort(next.key === null ? null : { field: next.key, order: next.order })}
        />
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-auto scrollbar-custom px-6 py-3">
        {/* 加载状态 */}
        {loadingList && <LoadingState label={t("loading")} />}

        {/* 空状态：居中图标 + 标题 + 说明（对齐 docs/references/design-patterns.md） */}
        {!loadingList && subscribeList.length === 0 && (
          <EmptyState
            data-testid="subscribe-empty"
            icon={Inbox}
            title={t("no_subscribes")}
            description={t("no_subscribes_hint")}
          />
        )}

        {/* 订阅行 */}
        {!loadingList &&
          subscribeList.length > 0 &&
          subscribeList.map((subscribe) => (
            <SubscribeRow key={subscribe.url} subscribe={subscribe} onEnable={handleEnable} onDelete={handleDelete} />
          ))}
      </div>
    </div>
  );
}

// ========== 订阅行 ==========
interface SubscribeRowProps {
  subscribe: SubscribeLoading;
  onEnable: (subscribe: SubscribeLoading, checked: boolean) => void;
  onDelete: (subscribe: SubscribeLoading) => void;
}

function SubscribeRowInner({ subscribe, onEnable, onDelete }: SubscribeRowProps) {
  const { t } = useTranslation();
  const version = subscribe.metadata.version?.[0] || "0.0";
  const scriptCount = Object.keys(subscribe.scripts || {}).length;
  const subtitle = [
    versionDisplay(version),
    t("script:subscribe_scripts_count", { count: scriptCount }),
    subscribe.author,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ListRow disabled={subscribe.status === SubscribeStatusType.disable}>
      <ListRowLeading>
        <span className="flex w-16 justify-center">
          <SubscribeEnableSwitch
            status={subscribe.status}
            enableLoading={subscribe.enableLoading}
            onCheckedChange={(checked) => onEnable(subscribe, checked)}
          />
        </span>
      </ListRowLeading>

      <ListRowMain>
        <SubscribeIcon name={subscribe.name} />
        <div className="flex min-w-0 flex-col gap-px">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm font-medium truncate">{subscribe.name}</span>
            </TooltipTrigger>
            <TooltipContent>{subscribe.name}</TooltipContent>
          </Tooltip>
          {/* 版本与来源由原来的固定列降级为元信息行 */}
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>
            <SubscribeSourceTag url={subscribe.url} />
          </span>
        </div>
      </ListRowMain>

      <ListRowTrailing className="gap-3">
        {/* 与脚本列表同一断点：窄窗口下站点图标让位给订阅名 */}
        <div className="hidden w-[140px] justify-center min-[900px]:flex">
          <PermissionFavicons connect={subscribe.metadata.connect} />
        </div>
        <div className="w-[150px]">
          <SubscribeUpdateTimeCell url={subscribe.url} updatetime={subscribe.updatetime} />
        </div>
      </ListRowTrailing>

      <ListRowActions>
        <SubscribeRowActions onDelete={() => onDelete(subscribe)} />
      </ListRowActions>
    </ListRow>
  );
}

const SubscribeRow = React.memo(SubscribeRowInner, (prev, next) => {
  return (
    prev.subscribe.url === next.subscribe.url &&
    prev.subscribe.status === next.subscribe.status &&
    prev.subscribe.enableLoading === next.subscribe.enableLoading &&
    prev.subscribe.actionLoading === next.subscribe.actionLoading &&
    prev.subscribe.updatetime === next.subscribe.updatetime
  );
});
