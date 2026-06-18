import React, { useCallback, useEffect, useState } from "react";
import { SubscribeStatusType } from "@App/app/repo/subscribe";
import { requestCheckSubscribeUpdate } from "@App/pages/store/features/subscribe";
import { Switch } from "@App/pages/components/ui/switch";
import { Badge } from "@App/pages/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@App/pages/components/ui/tooltip";
import { Button } from "@App/pages/components/ui/button";
import { semTime } from "@App/pkg/utils/dayjs";
import { t } from "@App/locales/locales";
import { cn } from "@App/pkg/utils/cn";
import { toast } from "sonner";
import { Globe, RefreshCw, Rss, Trash2, CircleArrowUp, Check, Loader2, Link } from "lucide-react";

// 基于字符串生成稳定的 HSL 颜色（订阅图标底色）
function hashToHsl(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = ((hash % 360) + 360) % 360;
  return `hsl(${h}, 55%, 55%)`;
}

// ========== SubscribeIcon ==========
// 订阅以 RSS 图标 + 名称生成的底色圆形作为标识
export function SubscribeIcon({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full text-white shrink-0"
      style={{ backgroundColor: hashToHsl(name), width: size, height: size }}
    >
      <Rss className="w-3.5 h-3.5" />
    </div>
  );
}

// ========== EnableSwitch ==========
export const SubscribeEnableSwitch = React.memo(
  ({
    status,
    enableLoading,
    onCheckedChange,
  }: {
    status: SubscribeStatusType;
    enableLoading: boolean | undefined;
    onCheckedChange: (checked: boolean) => void;
  }) => {
    // 切换进行中以转圈替代开关，明确展示 loading 态
    if (enableLoading) {
      return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    }
    return <Switch size="sm" checked={status === SubscribeStatusType.enable} onCheckedChange={onCheckedChange} />;
  },
  (prev, next) => prev.status === next.status && prev.enableLoading === next.enableLoading
);
SubscribeEnableSwitch.displayName = "SubscribeEnableSwitch";

// ========== PermissionFavicons ==========
// @connect 域名以站点 favicon 呈现，加载失败回退到地球图标
function DomainFavicon({ domain }: { domain: string }) {
  const [imgError, setImgError] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {imgError ? (
          <Globe className="w-3.5 h-3.5 text-muted-foreground/50" />
        ) : (
          <img
            src={`https://${domain}/favicon.ico`}
            alt={domain}
            className="w-3.5 h-3.5 rounded-full object-cover"
            onError={() => setImgError(true)}
          />
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom">{domain}</TooltipContent>
    </Tooltip>
  );
}

export const PermissionFavicons = React.memo(({ connect, maxShow = 5 }: { connect?: string[]; maxShow?: number }) => {
  if (!connect || connect.length === 0) return <span className="text-xs text-muted-foreground/50">{"-"}</span>;
  const visible = connect.slice(0, maxShow);
  const extra = connect.length - maxShow;
  return (
    <div className="flex items-center gap-1.5">
      {visible.map((domain) => (
        <DomainFavicon key={domain} domain={domain} />
      ))}
      {extra > 0 && <span className="text-[10px] text-muted-foreground ml-0.5">{`+${extra}`}</span>}
    </div>
  );
});
PermissionFavicons.displayName = "PermissionFavicons";

// ========== SourceTag ==========
// 订阅来源恒为「订阅地址」，悬浮展示解码后的订阅 URL
export const SubscribeSourceTag = React.memo(({ url }: { url: string }) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="success" className="gap-1 px-2 py-0.5 text-[11px] cursor-default">
          <Link className="w-3 h-3" />
          {t("script:subscribe_url")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{decodeURIComponent(url)}</TooltipContent>
    </Tooltip>
  );
});
SubscribeSourceTag.displayName = "SubscribeSourceTag";

// ========== UpdateTimeCell ==========
// 「最后更新」就近放置检查更新入口：idle → checking → latest（2s 恢复）/ has-update
type CheckUpdateState = "idle" | "checking" | "latest" | "has-update";

export const SubscribeUpdateTimeCell = React.memo(({ url, updatetime }: { url: string; updatetime?: number }) => {
  const [state, setState] = useState<CheckUpdateState>("idle");

  const handleCheck = useCallback(() => {
    if (state === "checking") return;
    setState("checking");
    requestCheckSubscribeUpdate(url)
      // res 为 true 时表示发现新版本并已打开更新页；false/undefined 表示已是最新
      .then((res) => setState(res ? "has-update" : "latest"))
      .catch((e) => {
        setState("idle");
        toast.error(`${t("script:update_check_failed")}: ${e}`);
      });
  }, [state, url]);

  // 「已是最新」短暂提示后恢复默认
  useEffect(() => {
    if (state !== "latest") return;
    const id = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(id);
  }, [state]);

  const time = updatetime ? semTime(new Date(updatetime)) : "-";

  return (
    <div className="flex items-center justify-center gap-1">
      {state === "latest" ? (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <Check className="w-3 h-3" />
          {t("script:latest_version")}
        </span>
      ) : (
        <span className="text-xs text-fg-secondary">{time}</span>
      )}
      {state === "has-update" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("check_update")}
              onClick={handleCheck}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15"
            >
              <CircleArrowUp className="w-3 h-3" />
              {t("script:new_version_available")}
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("check_update")}</TooltipContent>
        </Tooltip>
      ) : (
        state !== "latest" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("check_update")}
                onClick={handleCheck}
                className="text-muted-foreground opacity-60 transition-opacity hover:text-foreground hover:opacity-100"
              >
                <RefreshCw className={cn("w-3 h-3", state === "checking" && "animate-spin")} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("check_update")}</TooltipContent>
          </Tooltip>
        )
      )}
    </div>
  );
});
SubscribeUpdateTimeCell.displayName = "SubscribeUpdateTimeCell";

// ========== 行内删除操作 ==========
// 订阅仅支持删除（与 v1.4 一致）
export function SubscribeRowActions({ onDelete, className }: { onDelete: () => void; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("delete")}
            onClick={onDelete}
            className="h-7 w-7 hover:text-destructive focus-visible:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("delete")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
