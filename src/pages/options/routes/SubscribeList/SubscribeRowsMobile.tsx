import React, { useCallback, useState } from "react";
import { Inbox } from "lucide-react";
import { SubscribeStatusType } from "@App/app/repo/subscribe";
import { requestEnableSubscribe, type SubscribeLoading } from "@App/pages/store/features/subscribe";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { notify } from "@App/pages/components/ui/toast";
import { EmptyState } from "@App/pages/components/ui/empty-state";
import { LoadingState } from "@App/pages/components/ui/loading-state";
import {
  MobileActionSheet,
  MobileActionSheetItem,
  MobileListRow,
  MobileListRowLeading,
  MobileListRowMain,
  MobileListRowTrailing,
  MobileSwipeRow,
} from "@App/pages/components/ui/mobile-list";
import { versionDisplay } from "@App/pages/utils";
import { SubscribeIcon, SubscribeEnableSwitch, SubscribeSourceTag, SubscribeUpdateTimeCell } from "./components";

export interface SubscribeRowsMobileProps {
  subscribeList: SubscribeLoading[];
  loadingList: boolean;
  updateSubscribes: (urls: string[], data: Partial<SubscribeLoading>) => void;
  handleDelete: (subscribe: SubscribeLoading) => void;
}

export default function SubscribeRowsMobile({
  subscribeList,
  loadingList,
  updateSubscribes,
  handleDelete,
}: SubscribeRowsMobileProps) {
  const { t } = useTranslation();
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

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

  // 同时只允许一行滑开：否则多行会各自挂着「删除」块
  const [swipeOpenUrl, setSwipeOpenUrl] = useState<string | null>(null);
  const handleSwipeOpenChange = useCallback(
    (url: string, open: boolean) => setSwipeOpenUrl((prev) => (open ? url : prev === url ? null : prev)),
    []
  );

  if (loadingList) {
    return (
      <div className="flex-1 overflow-y-auto">
        <LoadingState label={t("loading")} />
      </div>
    );
  }

  if (subscribeList.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EmptyState icon={Inbox} title={t("no_subscribes")} description={t("no_subscribes_hint")} />
      </div>
    );
  }

  const sheetSubscribe = sheetUrl ? (subscribeList.find((s) => s.url === sheetUrl) ?? null) : null;

  return (
    <div className="flex-1 overflow-y-auto">
      {subscribeList.map((subscribe) => (
        <SubscribeRowMobile
          key={subscribe.url}
          subscribe={subscribe}
          swipeOpen={swipeOpenUrl === subscribe.url}
          onSwipeOpenChange={handleSwipeOpenChange}
          onEnable={handleEnable}
          onOpenActions={setSheetUrl}
          onDelete={handleDelete}
        />
      ))}

      {sheetSubscribe && (
        <MobileActionSheet
          open
          onOpenChange={(open) => !open && setSheetUrl(null)}
          title={sheetSubscribe.name}
          description={subtitleOf(sheetSubscribe, t)}
          icon={<SubscribeIcon name={sheetSubscribe.name} />}
        >
          {/* 行上放不下来源与更新时间，改由面板承载；检查更新入口就在更新时间旁边 */}
          <div className="flex items-center gap-2 px-4 py-2">
            <SubscribeSourceTag url={sheetSubscribe.url} />
            <SubscribeUpdateTimeCell url={sheetSubscribe.url} updatetime={sheetSubscribe.updatetime} />
          </div>
          <MobileActionSheetItem destructive onSelect={() => handleDelete(sheetSubscribe)}>
            {t("delete")}
          </MobileActionSheetItem>
        </MobileActionSheet>
      )}
    </div>
  );
}

function subtitleOf(subscribe: SubscribeLoading, t: TFunction) {
  const scriptCount = Object.keys(subscribe.scripts || {}).length;
  return [
    versionDisplay(subscribe.metadata.version?.[0] || "0.0"),
    t("script:subscribe_scripts_count", { count: scriptCount }),
    subscribe.author,
  ]
    .filter(Boolean)
    .join(" · ");
}

interface SubscribeRowMobileProps {
  subscribe: SubscribeLoading;
  swipeOpen: boolean;
  onSwipeOpenChange: (url: string, open: boolean) => void;
  onEnable: (subscribe: SubscribeLoading, checked: boolean) => void;
  onOpenActions: (url: string) => void;
  onDelete: (subscribe: SubscribeLoading) => void;
}

const SubscribeRowMobile = React.memo(
  ({ subscribe, swipeOpen, onSwipeOpenChange, onEnable, onOpenActions, onDelete }: SubscribeRowMobileProps) => {
    const { t } = useTranslation();
    return (
      <MobileSwipeRow
        open={swipeOpen}
        onOpenChange={(open) => onSwipeOpenChange(subscribe.url, open)}
        actions={
          <button
            type="button"
            onClick={() => onDelete(subscribe)}
            className="flex w-16 items-center justify-center bg-destructive text-xs font-medium text-destructive-foreground"
          >
            {t("delete")}
          </button>
        }
      >
        <MobileListRow disabled={subscribe.status === SubscribeStatusType.disable}>
          <MobileListRowLeading>
            <SubscribeIcon name={subscribe.name} />
          </MobileListRowLeading>

          <MobileListRowMain onClick={() => onOpenActions(subscribe.url)}>
            <span className="w-full truncate text-sm font-medium">{subscribe.name}</span>
            <span className="w-full truncate text-[11px] text-muted-foreground">{subtitleOf(subscribe, t)}</span>
          </MobileListRowMain>

          <MobileListRowTrailing>
            <SubscribeEnableSwitch
              status={subscribe.status}
              enableLoading={subscribe.enableLoading}
              onCheckedChange={(checked) => onEnable(subscribe, checked)}
            />
          </MobileListRowTrailing>
        </MobileListRow>
      </MobileSwipeRow>
    );
  },
  (prev, next) =>
    prev.subscribe.url === next.subscribe.url &&
    prev.subscribe.status === next.subscribe.status &&
    prev.subscribe.enableLoading === next.subscribe.enableLoading &&
    prev.subscribe.actionLoading === next.subscribe.actionLoading &&
    prev.subscribe.updatetime === next.subscribe.updatetime
);
SubscribeRowMobile.displayName = "SubscribeRowMobile";
