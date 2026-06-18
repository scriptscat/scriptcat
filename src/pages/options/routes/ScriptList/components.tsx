import React, { useCallback, useEffect, useState } from "react";
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
import { Button } from "@App/pages/components/ui/button";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { semTime } from "@App/pkg/utils/dayjs";
import { i18nName, t } from "@App/locales/locales";
import { cn } from "@App/pkg/utils/cn";
import {
  Globe,
  RefreshCw,
  House,
  Settings2,
  UploadCloud,
  Pencil,
  Play,
  Square,
  Trash2,
  CircleArrowUp,
  Check,
} from "lucide-react";

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
  iconUrl,
  size = 28,
  className,
}: {
  name: string;
  metadata?: SCMetadata;
  /** 直接指定图标 URL，优先于从 metadata 提取（popup 等场景已预先抽取好图标） */
  iconUrl?: string;
  size?: number;
  className?: string;
}) {
  const resolvedIcon = iconUrl ?? getScriptIconUrl(metadata);
  const [imgError, setImgError] = useState(false);
  const handleError = useCallback(() => setImgError(true), []);

  if (resolvedIcon && !imgError) {
    return (
      <img
        src={resolvedIcon}
        alt={name}
        onError={handleError}
        className={cn("rounded-md object-cover shrink-0", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const color = hashToHsl(name);
  const letter = name.charAt(0).toUpperCase();
  return (
    <div
      className={cn("flex items-center justify-center rounded-md text-white text-xs font-medium shrink-0", className)}
      style={{ backgroundColor: color, width: size, height: size }}
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
                <div className="relative">
                  <div className="absolute z-0 bg-foreground inset-0 rounded-full"></div>
                  <img
                    src={fav.icon}
                    alt={fav.match}
                    className="relative z-1 w-3.5 h-3.5 rounded-full object-cover cursor-pointer"
                    onClick={() => fav.website && window.open(fav.website, "_blank")}
                  />
                </div>
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
        {extra > 0 && (
          <span className="text-[10px] text-muted-foreground ml-0.5">
            {"+"}
            {extra}
          </span>
        )}
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
        <div className="w-1.5 h-1.5 rounded-full bg-success" />
        <span className="text-xs text-success">{t("script:running")}</span>
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
// 检查更新就近放在「最后更新」列：默认常驻可见的刷新图标（不再 opacity-0 隐藏），
// 点击后依次进入 检查中 → 已是最新（2s 后恢复）/ 存在新版本 状态。
type CheckUpdateState = "idle" | "checking" | "latest" | "has-update";

export const UpdateTimeCell = React.memo(({ script }: { script: ScriptLoading }) => {
  const [state, setState] = useState<CheckUpdateState>("idle");

  const handleCheck = useCallback(() => {
    if (state === "checking" || !script.checkUpdateUrl) return;
    setState("checking");
    scriptClient
      .requestCheckUpdate(script.uuid)
      // res 为 true 时已自动打开更新页，并就近提示「存在新版本」；为 false 表示已是最新版本
      .then((res) => setState(res ? "has-update" : "latest"))
      .catch(() => setState("idle"));
  }, [state, script.uuid, script.checkUpdateUrl]);

  // 「已是最新」短暂提示后恢复默认
  useEffect(() => {
    if (state !== "latest") return;
    const id = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(id);
  }, [state]);

  const time = script.updatetime ? semTime(new Date(script.updatetime)) : "-";
  const checkType = state === "has-update" ? 1 : script.checkUpdateUrl && state !== "latest" ? 2 : 0;

  return (
    <div className="flex items-center gap-1">
      <span className="inline-flex w-4">{/*fixed-width*/}</span>
      {state === "latest" ? (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <Check className="w-3 h-3" />
          {t("script:latest_version")}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{time}</span>
      )}
      {/* 检查到新版本：在时间旁展示「存在新版本」入口，点击可再次触发更新 */}
      <span className={"inline-flex w-4"}>
        {/*fixed-width*/}
        {checkType === 1 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("check_update")}
                onClick={handleCheck}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15"
              >
                <CircleArrowUp className="w-3.5 h-3.5" />
                {t("script:new_version_available")}
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("check_update")}</TooltipContent>
          </Tooltip>
        ) : (
          checkType === 2 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("check_update")}
                  onClick={handleCheck}
                  className="text-muted-foreground opacity-60 transition-opacity hover:text-foreground hover:opacity-100"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", state === "checking" && "animate-spin")} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("check_update")}</TooltipContent>
            </Tooltip>
          )
        )}
      </span>
    </div>
  );
});
UpdateTimeCell.displayName = "UpdateTimeCell";

// ========== 行内操作 ==========
// 取代原 ⋯ 更多菜单：主页 / 用户配置 / 云端 / 运行·停止 / 编辑 / 删除，均按条件出现，右对齐。
// 表格与卡片复用同一套，确保行为一致。检查更新不在此处（见 UpdateTimeCell）。
function ActionButton({
  label,
  onClick,
  destructive,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className={cn("h-7 w-7", destructive && "hover:text-destructive focus-visible:text-destructive")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ScriptRowActions({
  script,
  navigate,
  onDelete,
  onRunStop,
  className,
}: {
  script: ScriptLoading;
  navigate: (to: string) => void;
  onDelete: (script: ScriptLoading) => void;
  onRunStop: (script: ScriptLoading) => void;
  className?: string;
}) {
  const home = getScriptHomePage(script.metadata);
  const isBackground = script.type !== SCRIPT_TYPE_NORMAL;
  const isRunning = script.runStatus === SCRIPT_RUN_STATUS_RUNNING;
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {home && (
        <ActionButton label={t("script:homepage")} onClick={() => window.open(home, "_blank")}>
          <House className="w-3.5 h-3.5" />
        </ActionButton>
      )}
      {script.config && (
        <ActionButton label={t("editor:user_config")} onClick={() => navigate(`/?userConfig=${script.uuid}`)}>
          <Settings2 className="w-3.5 h-3.5" />
        </ActionButton>
      )}
      {script.metadata?.cloudcat && (
        <ActionButton label={t("editor:upload_to_cloud")} onClick={() => navigate(`/?cloud=${script.uuid}`)}>
          <UploadCloud className="w-3.5 h-3.5" />
        </ActionButton>
      )}
      {isBackground && (
        <ActionButton
          label={isRunning ? t("stop") : t("editor:run")}
          onClick={() => onRunStop(script)}
          disabled={script.actionLoading}
        >
          {isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </ActionButton>
      )}
      <ActionButton label={t("edit")} onClick={() => navigate(`/script/editor/${script.uuid}`)}>
        <Pencil className="w-3.5 h-3.5" />
      </ActionButton>
      <Popconfirm
        description={t("script:confirm_delete_script_content", { name: i18nName(script) })}
        destructive
        confirmText={t("delete")}
        cancelText={t("editor:cancel")}
        onConfirm={() => onDelete(script)}
      >
        <ActionButton label={t("delete")} destructive>
          <Trash2 className="w-3.5 h-3.5" />
        </ActionButton>
      </Popconfirm>
    </div>
  );
}

// ========== 脚本主页链接 ==========
// 取脚本主页/支持链接（优先 homepage，其次 homepageurl / website / source / supporturl）
export function getScriptHomePage(metadata?: SCMetadata): string | undefined {
  if (!metadata) return undefined;
  for (const key of ["homepage", "homepageurl", "website", "source", "supporturl"] as const) {
    const url = metadata[key]?.[0];
    if (url) return url;
  }
  return undefined;
}

// ========== SourceTag ==========
export const SourceTag = React.memo(
  ({ script }: { script: ScriptLoading }) => {
    if (script.subscribeUrl) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="warning" className="text-[10px] px-1.5 py-0 cursor-default">
              {t("script:source_subscribe_link")}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{decodeURIComponent(script.subscribeUrl)}</TooltipContent>
        </Tooltip>
      );
    }
    if (!script.origin) {
      return (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 cursor-default">
          {t("script:source_local_script")}
        </Badge>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="success" className="text-[10px] px-1.5 py-0 cursor-default">
            {t("script:source_script_link")}
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
  if (type === SCRIPT_TYPE_NORMAL) return t("script:script_list.sidebar.normal_script");
  return t("script:background_script");
}
