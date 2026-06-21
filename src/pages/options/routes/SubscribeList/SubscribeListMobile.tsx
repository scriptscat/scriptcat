import { memo } from "react";
import { ListFilter, Check } from "lucide-react";
import { SubscribeStatusType } from "@App/app/repo/subscribe";
import type { SubscribeLoading } from "@App/pages/store/features/subscribe";
import { useTranslation } from "react-i18next";
import { cn } from "@App/pkg/utils/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { SearchInput } from "@App/pages/components/ui/search-input";
import SubscribeCardGrid from "./SubscribeCardGrid";

export interface SubscribeListMobileProps {
  subscribeList: SubscribeLoading[];
  loadingList: boolean;
  updateSubscribes: (urls: string[], data: Partial<SubscribeLoading>) => void;
  handleDelete: (subscribe: SubscribeLoading) => void;
  searchKeyword: string;
  setSearchKeyword: (kw: string) => void;
  statusFilter: SubscribeStatusType | null;
  setStatusFilter: (v: SubscribeStatusType | null) => void;
}

// ========== 移动端状态筛选 ==========
function MobileStatusFilter({
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
          aria-label={t("script:script_list.sidebar.status")}
          className={cn(
            "flex items-center justify-center h-9 w-9 shrink-0 rounded-md bg-muted/50 text-muted-foreground transition-colors hover:text-foreground",
            statusFilter !== null && "text-primary"
          )}
        >
          <ListFilter className="w-4 h-4" />
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

function SubscribeListMobile({
  subscribeList,
  loadingList,
  updateSubscribes,
  handleDelete,
  searchKeyword,
  setSearchKeyword,
  statusFilter,
  setStatusFilter,
}: SubscribeListMobileProps) {
  const { t } = useTranslation();
  return (
    <div data-testid="subscribe-page" className="flex flex-col h-full">
      {/* 搜索 + 状态筛选 */}
      <div className="flex items-center gap-2 px-4 py-1.5 shrink-0">
        <SearchInput
          className="flex-1"
          inputClassName="text-sm"
          aria-label={t("script:enter_subscribe_name")}
          placeholder={t("script:enter_subscribe_name")}
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
        />
        <MobileStatusFilter statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
      </div>

      <SubscribeCardGrid
        subscribeList={subscribeList}
        loadingList={loadingList}
        updateSubscribes={updateSubscribes}
        handleDelete={handleDelete}
      />
    </div>
  );
}

export default memo(SubscribeListMobile);
