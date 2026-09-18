import React, { useCallback, useEffect, useState } from "react";
import type { SCRIPT_STATUS, SCMetadata } from "@App/app/repo/scripts";
import {
  SCRIPT_STATUS_ENABLE,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_RUN_STATUS_ERROR,
  SCRIPT_TYPE_NORMAL,
  SCRIPT_TYPE_CRONTAB,
} from "@App/app/repo/scripts";
import { scriptClient, synchronizeClient, type ScriptLoading } from "@App/pages/store/features/script";
import { notify } from "@App/pages/components/ui/toast";
import { Switch } from "@App/pages/components/ui/switch";
import { Badge } from "@App/pages/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@App/pages/components/ui/tooltip";
import { Button } from "@App/pages/components/ui/button";
import { semTime } from "@App/locales/relative-date";
import { i18nName } from "@App/locales/locales";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { cn } from "@App/pkg/utils/cn";
import { getNameAvatarTone, NameAvatar } from "@App/pages/components/NameAvatar";
import {
  Globe,
  RefreshCw,
  Play,
  Square,
  CircleArrowUp,
  Check,
  Clock,
  Ellipsis,
  House,
  Settings2,
  UploadCloud,
  Pencil,
  Download,
  Trash2,
} from "lucide-react";
import { preloadCloudScriptPlan } from "@App/pages/components/CloudScriptPlan";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
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
import { preloadUserConfig } from "./preload";
import { nextTimeDisplay } from "@App/pkg/utils/cron";
import { useSystemConfig } from "@App/pages/options/hooks/useSystemConfig";

// ========== Tag 配色 ==========
// 分类标签 chip 取 --label-* 令牌族（src/index.css），明暗主题自动切换；详见 docs/references/design-tokens.md。
export function getTagColor(tag: string) {
  return getNameAvatarTone(tag);
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
    // 开关本身即自解释（开/关），无需 Tooltip 提示——全应用其它 Switch 也均无提示。
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

  const letter = name.charAt(0).toUpperCase();
  return (
    <NameAvatar seed={name} size={size} className={className}>
      {letter}
    </NameAvatar>
  );
}

// 仅允许 http/https 协议打开外部链接，避免脚本 metadata 注入 javascript:/data:/file: 等异常协议
function isSafeHttpUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// 打开外部链接（仅限 http/https）。脚本主页/站点图标等 URL 均来自脚本 metadata，不可信。
export function openExternalUrl(url: string | undefined) {
  if (isSafeHttpUrl(url)) window.open(url, "_blank");
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
              <button
                type="button"
                aria-label={fav.match}
                className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onClick={() => openExternalUrl(fav.website)}
              >
                {fav.icon ? (
                  <span className="relative inline-flex">
                    <span className="absolute z-0 bg-foreground inset-0 rounded-full" />
                    <img
                      src={fav.icon}
                      alt={fav.match}
                      className="relative z-1 w-3.5 h-3.5 rounded-full object-cover"
                    />
                  </span>
                ) : (
                  <Globe className="w-3.5 h-3.5 text-muted-foreground/50" />
                )}
              </button>
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
  const { t } = useTranslation();
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
        <span className="text-xs text-destructive">{t("error")}</span>
      </div>
    );
  }
  // 停止 / 未运行 / 已完成
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
      <span className="text-xs text-muted-foreground">{t("stopped")}</span>
    </div>
  );
}

// ========== UpdateTimeCell ==========
// 检查更新就近放在「最后更新」列：默认常驻可见的刷新图标（不再 opacity-0 隐藏），
// 点击后依次进入 检查中 → 已是最新（2s 后恢复）/ 存在新版本 状态。
type CheckUpdateState = "idle" | "checking" | "latest" | "has-update";

export const UpdateTimeCell = React.memo(({ script }: { script: ScriptLoading }) => {
  const { t } = useTranslation();
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
    <div className="flex items-center gap-1.5">
      <span className="inline-flex w-4">{/*fixed-width*/}</span>
      {state === "latest" ? (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <Check className="w-3 h-3" />
          {t("script:latest_version")}
        </span>
      ) : checkType === 1 ? (
        /* 检查到新版本：直接取代时间展示「存在新版本」入口，点击可再次触发更新 */
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("check_update")}
              onClick={handleCheck}
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-primary hover:underline"
            >
              <CircleArrowUp className="w-3 h-3" />
              {t("script:new_version_available")}
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("check_update")}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-xs text-muted-foreground">{time}</span>
      )}
      {/* 固定宽度槽位：仅放无更新时的小刷新图标，其余状态留空占位以保持列对齐 */}
      <span className="inline-flex w-4">
        {checkType === 2 && (
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
        )}
      </span>
    </div>
  );
});
UpdateTimeCell.displayName = "UpdateTimeCell";

// ========== 行内操作 ==========
// 操作槽内的统一按钮外观。检查更新不在这里（见 UpdateTimeCell）。
type ActionButtonProps = React.ComponentPropsWithoutRef<typeof Button> & {
  label: string;
  destructive?: boolean;
  onPreload?: () => void;
};

// 透传 props + ref：使其可直接作为 Radix asChild 的 trigger（更多菜单即如此用），
// 让 trigger 语义/焦点/aria 落在真实按钮上，无需外包 div。
const ActionButton = ({
  label,
  onClick,
  destructive,
  disabled,
  onPreload,
  children,
  className,
  ref,
  ...rest
}: ActionButtonProps & { ref?: React.Ref<HTMLButtonElement> }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        aria-label={label}
        onClick={onClick}
        onPointerEnter={onPreload}
        onFocus={onPreload}
        disabled={disabled}
        className={cn("h-7 w-7", destructive && "hover:text-destructive focus-visible:text-destructive", className)}
        {...rest}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

/**
 * 列表行的固定三槽操作：编辑 / 运行·停止 / 更多。
 * 槽位数与脚本类型无关——普通脚本的运行槽渲染为等宽占位，使各行右缘始终对齐；
 * 条件性操作（主页、用户配置、云端上传、删除）收进「更多」，删除进二级菜单亦降低误触。
 */
export function ScriptRowActionSlots({
  script,
  navigate,
  onDelete,
  onRunStop,
}: {
  script: ScriptLoading;
  navigate: (to: string) => void;
  onDelete: (script: ScriptLoading) => void;
  onRunStop: (script: ScriptLoading) => void;
}) {
  const { t } = useTranslation();
  const [trashEnabled] = useSystemConfig("trash_enabled");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const home = getScriptHomePage(script.metadata);
  const isBackground = script.type !== SCRIPT_TYPE_NORMAL;
  const isRunning = script.runStatus === SCRIPT_RUN_STATUS_RUNNING;
  const preloadUserConfigValues = () => void preloadUserConfig(script).catch(() => undefined);
  const preloadCloudPlan = () => void preloadCloudScriptPlan(script).catch(() => undefined);

  const openEditor = () => navigate(`/script/editor/${script.uuid}`);
  const openUserConfig = () => {
    preloadUserConfigValues();
    navigate(`/?userConfig=${script.uuid}`);
  };
  const openCloud = () => {
    preloadCloudPlan();
    navigate(`/?cloud=${script.uuid}`);
  };
  const exportSelf = () => {
    const id = notify.loading(t("editor:exporting"));
    void synchronizeClient.export([script.uuid]).then(() => notify.success(t("settings:export_success"), { id }));
  };

  // 运行槽在两套排布里都出现，故只写一次
  const runButton = (
    <ActionButton
      label={isRunning ? t("stop") : t("editor:run")}
      onClick={() => onRunStop(script)}
      disabled={script.actionLoading}
    >
      {isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
    </ActionButton>
  );

  return (
    <>
      {/* 宽窗口摊开全部操作；窄窗口它们会把脚本名挤没（#1698），故窄于断点时换成下面的紧凑排布。
          min-w 取满配 7 个按钮的宽度：条件按钮的有无会改变本区宽度，进而把左侧的更新时间列推得逐行参差。
          断点取 1160 而非 1000：摊开态比紧凑态多占 160px，实测 1000px 处名称会从 253px 直接掉到 150px，
          即「窗口拉宽反而更窄」；1160px 起摊开态才不会让名称比紧凑态更窄。 */}
      <span
        data-testid="row-actions-wide"
        className="hidden min-w-[220px] items-center justify-end gap-1 min-[1160px]:flex"
      >
        {home && (
          <ActionButton label={t("script:homepage")} onClick={() => openExternalUrl(home)}>
            <House className="w-3.5 h-3.5" />
          </ActionButton>
        )}
        {script.config && (
          <ActionButton label={t("editor:user_config")} onPreload={preloadUserConfigValues} onClick={openUserConfig}>
            <Settings2 className="w-3.5 h-3.5" />
          </ActionButton>
        )}
        {script.metadata?.cloudcat && (
          <ActionButton label={t("editor:upload_to_cloud")} onPreload={preloadCloudPlan} onClick={openCloud}>
            <UploadCloud className="w-3.5 h-3.5" />
          </ActionButton>
        )}
        {isBackground && runButton}
        <ActionButton label={t("edit")} onClick={openEditor}>
          <Pencil className="w-3.5 h-3.5" />
        </ActionButton>
        <ActionButton label={t("export")} onClick={exportSelf}>
          <Download className="w-3.5 h-3.5" />
        </ActionButton>
        <ActionButton label={t("delete")} destructive onClick={() => setConfirmDelete(true)}>
          <Trash2 className="w-3.5 h-3.5" />
        </ActionButton>
      </span>

      <span data-testid="row-actions-compact" className="flex items-center gap-1 min-[1160px]:hidden">
        {/* 普通脚本没有运行按钮，留等宽占位让更多按钮在所有行对齐同一横坐标 */}
        {isBackground ? runButton : <span aria-hidden className="size-7 shrink-0" />}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ActionButton label={t("script:more_actions")}>
              <Ellipsis className="w-3.5 h-3.5" />
            </ActionButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={openEditor}>{t("edit")}</DropdownMenuItem>
            {home && <DropdownMenuItem onClick={() => openExternalUrl(home)}>{t("script:homepage")}</DropdownMenuItem>}
            {script.config && (
              <DropdownMenuItem onPointerEnter={preloadUserConfigValues} onClick={openUserConfig}>
                {t("editor:user_config")}
              </DropdownMenuItem>
            )}
            {script.metadata?.cloudcat && (
              <DropdownMenuItem onPointerEnter={preloadCloudPlan} onClick={openCloud}>
                {t("editor:upload_to_cloud")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={exportSelf}>{t("export")}</DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setConfirmDelete(true)}
            >
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {(trashEnabled ?? true)
                ? t("script:confirm_delete_script_trash_content", { name: i18nName(script) })
                : t("script:confirm_delete_script_content", { name: i18nName(script) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("editor:cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => onDelete(script)}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ========== 脚本主页链接 ==========
// 取脚本主页/支持链接（优先 homepage，其次 homepageurl / website / source / supporturl）
export function getScriptHomePage(metadata?: SCMetadata): string | undefined {
  if (!metadata) return undefined;
  for (const key of ["homepage", "homepageurl", "website", "source", "supporturl"] as const) {
    const url = metadata[key]?.[0];
    if (url && isSafeHttpUrl(url)) return url;
  }
  return undefined;
}

// ========== SourceTag ==========
export const SourceTag = React.memo(
  ({ script }: { script: ScriptLoading }) => {
    const { t } = useTranslation();
    if (script.subscribeUrl) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="warning" className="shrink-0 text-[10px] px-1.5 py-0 cursor-default">
              {t("script:source_subscribe_link")}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{decodeURIComponent(script.subscribeUrl)}</TooltipContent>
        </Tooltip>
      );
    }
    if (!script.origin) {
      return (
        <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 cursor-default">
          {t("script:source_local_script")}
        </Badge>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="success" className="shrink-0 text-[10px] px-1.5 py-0 cursor-default">
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
export function scriptTypeLabel(type: number, t: TFunction): string {
  if (type === SCRIPT_TYPE_NORMAL) return t("script:script_list.sidebar.normal_script");
  if (type === SCRIPT_TYPE_CRONTAB) return t("script:scheduled_script");
  return t("script:background_script");
}

// ========== 定时脚本下次运行时间 ==========
// 仅 crontab 脚本展示，复用安装页同款 nextTimeDisplay；Tooltip 显示完整文案与原始 cron 表达式。
export function ScheduleNextRun({ script, className }: { script: ScriptLoading; className?: string }) {
  const { t } = useTranslation();
  if (script.type !== SCRIPT_TYPE_CRONTAB) return null;
  const cron = script.metadata?.crontab?.[0];
  if (!cron) return null;
  const display = nextTimeDisplay(cron);
  // 槽位仅 140px，「下次运行 + 完整时间」会被截断；行内只保留时间（前置时钟图标已表意），
  // 完整文案与原始 cron 表达式放进 Tooltip，悬浮即可查看，截断也不丢信息。
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("flex items-center gap-1 text-[11px] text-muted-foreground truncate", className)}>
          <Clock className="size-3 shrink-0" />
          <span className="truncate">{display}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div>
          {t("script:next_run")} {display}
        </div>
        <div className="font-mono text-[10px] opacity-80">{cron}</div>
      </TooltipContent>
    </Tooltip>
  );
}
