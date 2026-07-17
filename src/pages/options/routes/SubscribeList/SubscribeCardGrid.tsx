import React, { useCallback } from "react";
import { Inbox } from "lucide-react";
import { SubscribeStatusType } from "@App/app/repo/subscribe";
import { requestEnableSubscribe, type SubscribeLoading } from "@App/pages/store/features/subscribe";
import { useTranslation } from "react-i18next";
import { notify } from "@App/pages/components/ui/toast";
import { EmptyState } from "@App/pages/components/ui/empty-state";
import { LoadingState } from "@App/pages/components/ui/loading-state";
import { Surface } from "@App/pages/components/ui/surface";
import { versionDisplay } from "@App/pages/utils";
import {
  SubscribeIcon,
  SubscribeEnableSwitch,
  PermissionFavicons,
  SubscribeSourceTag,
  SubscribeUpdateTimeCell,
  SubscribeRowActions,
} from "./components";

export interface SubscribeCardGridProps {
  subscribeList: SubscribeLoading[];
  loadingList: boolean;
  updateSubscribes: (urls: string[], data: Partial<SubscribeLoading>) => void;
  handleDelete: (subscribe: SubscribeLoading) => void;
}

// ========== 卡片网格主组件 ==========
function SubscribeCardGrid({ subscribeList, loadingList, updateSubscribes, handleDelete }: SubscribeCardGridProps) {
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
    <div className="flex-1 overflow-auto scrollbar-custom px-4 pt-4 pb-6">
      {loadingList && <LoadingState label={t("loading")} />}

      {!loadingList && subscribeList.length === 0 && (
        <EmptyState icon={Inbox} title={t("no_subscribes")} description={t("no_subscribes_hint")} />
      )}

      {!loadingList && subscribeList.length > 0 && (
        <div className="flex flex-col gap-3">
          {subscribeList.map((subscribe) => (
            <SubscribeCardItem
              key={subscribe.url}
              subscribe={subscribe}
              onEnable={handleEnable}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ========== 单个卡片 ==========
interface SubscribeCardItemProps {
  subscribe: SubscribeLoading;
  onEnable: (subscribe: SubscribeLoading, checked: boolean) => void;
  onDelete: (subscribe: SubscribeLoading) => void;
}

const SubscribeCardItem = React.memo(
  ({ subscribe, onEnable, onDelete }: SubscribeCardItemProps) => {
    const { t } = useTranslation();
    const isDisabled = subscribe.status === SubscribeStatusType.disable;
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
      <Surface data-testid="subscribe-card" interactive disabled={isDisabled} className="group/card rounded-lg">
        {/* 头部: 图标 + 名称/元信息 + 开关 */}
        <div className="flex items-start gap-2.5 mb-3">
          <SubscribeIcon name={subscribe.name} />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold leading-tight line-clamp-2 text-foreground">{subscribe.name}</span>
            <span className="text-[11px] text-muted-foreground block mt-0.5 truncate">{subtitle}</span>
          </div>
          <SubscribeEnableSwitch
            status={subscribe.status}
            enableLoading={subscribe.enableLoading}
            onCheckedChange={(checked) => onEnable(subscribe, checked)}
          />
        </div>

        {/* 来源 + 权限 */}
        <div className="flex items-center gap-2 mb-3 min-h-[20px]">
          <SubscribeSourceTag url={subscribe.url} />
          <PermissionFavicons connect={subscribe.metadata.connect} />
        </div>

        {/* 分隔线 */}
        <div className="h-px bg-border mb-3" />

        {/* 底部: 更新时间 + 操作 */}
        <div className="flex items-center justify-between">
          <SubscribeUpdateTimeCell url={subscribe.url} updatetime={subscribe.updatetime} />
          <SubscribeRowActions onDelete={() => onDelete(subscribe)} />
        </div>
      </Surface>
    );
  },
  (prev, next) =>
    prev.subscribe.url === next.subscribe.url &&
    prev.subscribe.status === next.subscribe.status &&
    prev.subscribe.enableLoading === next.subscribe.enableLoading &&
    prev.subscribe.actionLoading === next.subscribe.actionLoading &&
    prev.subscribe.updatetime === next.subscribe.updatetime
);
SubscribeCardItem.displayName = "SubscribeCardItem";

export default React.memo(SubscribeCardGrid);
