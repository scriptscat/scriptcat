import React, { useCallback, useState } from "react";
import type { SCRIPT_STATUS, SCMetadata } from "@App/app/repo/scripts";
import {
  SCRIPT_STATUS_ENABLE,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_RUN_STATUS_ERROR,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import { scriptClient, type ScriptLoading } from "@App/pages/store/features/script";
import { Switch } from "@App/pages/components/ui/switch";
import { Badge } from "@App/pages/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@App/pages/components/ui/tooltip";
import { semTime } from "@App/pkg/utils/dayjs";
import { t } from "@App/locales/locales";
import { cn } from "@App/pkg/utils/cn";
import { Globe, RefreshCw } from "lucide-react";

// 基于字符串生成稳定的 HSL 颜色
function hashToHsl(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = ((hash % 360) + 360) % 360;
  return `hsl(${h}, 55%, 55%)`;
}

// ========== Tag 配色 ==========
const TAG_COLORS: Array<{ bg: string; text: string }> = [
  { bg: "bg-green-50 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300" },
  { bg: "bg-blue-50 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300" },
  { bg: "bg-purple-50 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300" },
  { bg: "bg-orange-50 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300" },
  { bg: "bg-rose-50 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-300" },
  { bg: "bg-teal-50 dark:bg-teal-900/40", text: "text-teal-700 dark:text-teal-300" },
  { bg: "bg-amber-50 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-indigo-50 dark:bg-indigo-900/40", text: "text-indigo-700 dark:text-indigo-300" },
];

export function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[((hash % TAG_COLORS.length) + TAG_COLORS.length) % TAG_COLORS.length];
}

// ========== EnableSwitch ==========
export const EnableSwitch = React.memo(
  ({
    status,
    enableLoading,
    onCheckedChange,
  }: {
    status: SCRIPT_STATUS;
    enableLoading: boolean | undefined;
    onCheckedChange: (checked: boolean) => void;
  }) => {
    return (
      <Switch
        size="sm"
        checked={status === SCRIPT_STATUS_ENABLE}
        disabled={enableLoading}
        onCheckedChange={onCheckedChange}
      />
    );
  },
  (prev, next) => prev.status === next.status && prev.enableLoading === next.enableLoading
);
EnableSwitch.displayName = "EnableSwitch";

// ========== ScriptIcon ==========
// 从 metadata 中提取脚本图标 URL（@icon / @iconURL / @icon64 / @icon64URL）
function getScriptIconUrl(metadata?: SCMetadata): string | undefined {
  if (!metadata) return undefined;
  const [url] = metadata.icon || metadata.iconurl || metadata.icon64 || metadata.icon64url || [];
  return url;
}

export function ScriptIcon({
  name,
  metadata,
  className,
}: {
  name: string;
  metadata?: SCMetadata;
  className?: string;
}) {
  const iconUrl = getScriptIconUrl(metadata);
  const [imgError, setImgError] = useState(false);
  const handleError = useCallback(() => setImgError(true), []);

  if (iconUrl && !imgError) {
    return (
      <img
        src={iconUrl}
        alt={name}
        onError={handleError}
        className={cn("rounded-md object-cover shrink-0", className)}
        style={{ width: 28, height: 28 }}
      />
    );
  }

  const color = hashToHsl(name);
  const letter = name.charAt(0).toUpperCase();
  return (
    <div
      className={cn("flex items-center justify-center rounded-full text-white text-xs font-medium shrink-0", className)}
      style={{ backgroundColor: color, width: 28, height: 28 }}
    >
      {letter}
    </div>
  );
}

// ========== FaviconDots ==========
export const FaviconDots = React.memo(
  ({ favorites, maxShow = 5 }: { favorites?: ScriptLoading["favorite"]; maxShow?: number }) => {
    if (!favorites || favorites.length === 0) return null;
    const visible = favorites.slice(0, maxShow);
    const extra = favorites.length - maxShow;
    return (
      <div className="flex items-center gap-1.5">
        {visible.map((fav, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              {fav.icon ? (
                <img
                  src={fav.icon}
                  alt={fav.match}
                  className="w-3.5 h-3.5 rounded-full object-cover cursor-pointer"
                  onClick={() => fav.website && window.open(fav.website, "_blank")}
                />
              ) : (
                <Globe
                  className="w-3.5 h-3.5 text-muted-foreground/50 cursor-pointer"
                  onClick={() => fav.website && window.open(fav.website, "_blank")}
                />
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom">{fav.match}</TooltipContent>
          </Tooltip>
        ))}
        {extra > 0 && <span className="text-[10px] text-muted-foreground ml-0.5">+{extra}</span>}
      </div>
    );
  }
);
FaviconDots.displayName = "FaviconDots";

// ========== RunStatusBadge ==========
export function RunStatusBadge({ runStatus }: { runStatus?: string }) {
  if (runStatus === SCRIPT_RUN_STATUS_RUNNING) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span className="text-xs text-green-500">{t("running")}</span>
      </div>
    );
  }
  if (runStatus === SCRIPT_RUN_STATUS_ERROR) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
        <span className="text-xs text-destructive">{t("error", { defaultValue: "错误" })}</span>
      </div>
    );
  }
  // 停止 / 未运行 / 已完成
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
      <span className="text-xs text-muted-foreground">{t("stopped", { defaultValue: "已停止" })}</span>
    </div>
  );
}

// ========== UpdateTimeCell ==========
export const UpdateTimeCell = React.memo(({ script }: { script: ScriptLoading }) => {
  const [checking, setChecking] = useState(false);

  const handleCheck = () => {
    if (checking || !script.checkUpdateUrl) return;
    setChecking(true);
    scriptClient
      .requestCheckUpdate(script.uuid)
      .then((res) => {
        if (res) {
          // TODO: toast
        }
      })
      .finally(() => setChecking(false));
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">
        {script.updatetime ? semTime(new Date(script.updatetime)) : "-"}
      </span>
      {script.checkUpdateUrl && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCheck}
              className="opacity-0 group-hover/row:opacity-50 hover:!opacity-100 transition-opacity"
            >
              <RefreshCw className={cn("w-3 h-3 text-muted-foreground", checking && "animate-spin")} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("check_update")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
});
UpdateTimeCell.displayName = "UpdateTimeCell";

// ========== SourceTag ==========
export const SourceTag = React.memo(
  ({ script }: { script: ScriptLoading }) => {
    if (script.subscribeUrl) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="warning" className="text-[10px] px-1.5 py-0 cursor-default">
              {t("source_subscribe_link")}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{decodeURIComponent(script.subscribeUrl)}</TooltipContent>
        </Tooltip>
      );
    }
    if (!script.origin) {
      return (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 cursor-default">
          {t("source_local_script")}
        </Badge>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="success" className="text-[10px] px-1.5 py-0 cursor-default">
            {t("source_script_link")}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{decodeURIComponent(script.origin)}</TooltipContent>
      </Tooltip>
    );
  },
  (prev, next) => prev.script.subscribeUrl === next.script.subscribeUrl && prev.script.origin === next.script.origin
);
SourceTag.displayName = "SourceTag";

// ========== 脚本类型标签文本 ==========
export function scriptTypeLabel(type: number): string {
  if (type === SCRIPT_TYPE_NORMAL) return t("script_list.sidebar.normal_script");
  return t("background_script");
}
