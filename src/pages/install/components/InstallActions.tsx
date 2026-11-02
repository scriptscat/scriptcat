import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Download, Eye, EyeOff, History, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@App/pages/components/ui/dropdown-menu";
import { cn } from "@App/pkg/utils/cn";
import type { ActionPlacement } from "./InstallLayout";

export interface InstallActionsProps {
  /** 身份卡内用大一号按钮;sticky 副本不抢初始焦点 */
  placement: ActionPlacement;
  isUpdate: boolean;
  /** 脚本在回收站中：主按钮由「安装/更新」改为「还原/还原并更新」 */
  inTrash?: boolean;
  /** 回收站态下页面版本与回收站里那份是否不同，决定「还原」还是「还原并更新」 */
  versionChanged?: boolean;
  isSubscribe: boolean;
  primaryDisabled?: boolean;
  /** 安装动作的就地反馈阶段：主按钮在原地走完 安装中 → 已安装，失败则回到可重试 */
  phase?: "idle" | "installing" | "installed" | "failed";
  localFile?: boolean;
  watching?: boolean;
  onInstall: (opts?: { closeAfterInstall?: boolean; noMoreUpdates?: boolean; rememberSession?: boolean }) => void;
  onClose: (opts?: { noMoreUpdates?: boolean }) => void;
  onToggleWatch?: () => void;
  /** 仅「外部接入」触发的安装提供：显式拒绝（区别于「关闭」——关闭窗口本身不算决定，只有点击这个按钮才算拒绝） */
  onExternalAccessReject?: () => void;
  /** 仅「外部接入」触发的安装提供：本会话允许（安装并对该脚本本会话内免询问，设计 §3 第三档） */
  onExternalAccessSessionAllow?: () => void;
}

/**
 * 拆分按钮的「更多」下拉。受控展开:onPointerDown 阻断 Radix 自身的指针展开,
 * 改由 onClick 切换 open —— 在 DOM 测试环境与真实浏览器中行为一致(避免指针/点击双触发)。
 */
function MoreMenu({
  testid,
  label,
  variant,
  size,
  triggerClassName,
  disabled,
  children,
}: {
  testid: string;
  label: string;
  variant: "default" | "outline";
  size: "icon" | "icon-lg";
  triggerClassName?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          data-testid={testid}
          variant={variant}
          size={size}
          disabled={disabled}
          aria-label={label}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
          className={triggerClassName}
        >
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InstallActions({
  placement,
  isUpdate,
  inTrash,
  versionChanged,
  isSubscribe,
  primaryDisabled,
  phase = "idle",
  localFile,
  watching,
  onInstall,
  onClose,
  onToggleWatch,
  onExternalAccessReject,
  onExternalAccessSessionAllow,
}: InstallActionsProps) {
  const { t } = useTranslation(["install", "common", "editor", "external_access"]);

  // 安装已发出或已完成期间锁住所有会再次发起安装/决策的入口，避免重复提交
  const busy = phase === "installing" || phase === "installed";
  const idleLabel = inTrash
    ? versionChanged
      ? t("install:btn_restore_update")
      : t("install:btn_restore")
    : isUpdate
      ? t("install:update_script")
      : t("install:script");
  const primaryLabel =
    phase === "installing"
      ? t("install:btn_installing")
      : phase === "installed"
        ? t("install:btn_installed")
        : phase === "failed"
          ? t("install:btn_retry_install")
          : idleLabel;
  const noCloseLabel = isUpdate ? t("install:update_script_no_close") : t("install:script_no_close");
  const noMoreUpdateLabel = isUpdate ? t("install:update_script_no_more_update") : t("install:script_no_more_update");
  const PrimaryIcon =
    phase === "installing" ? Loader2 : phase === "installed" ? Check : isUpdate ? RefreshCw : Download;

  const large = placement === "card";
  const size = large ? "lg" : "default";
  const iconSize = large ? "icon-lg" : "icon";

  return (
    <div className={cn("flex shrink-0 items-center gap-2", placement === "footer" && "w-full justify-end")}>
      {localFile && (
        <Button
          data-testid="watch-toggle"
          variant={watching ? "default" : "outline"}
          size={size}
          title={t("editor:watch_file_description")}
          disabled={busy}
          onClick={onToggleWatch}
          className="gap-1.5"
        >
          {watching ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {watching ? t("editor:stop_watch_file") : t("editor:watch_file")}
        </Button>
      )}

      {onExternalAccessReject ? (
        // 「外部接入」触发：三档决策 拒绝 / 本会话允许 / 安装（设计 §3）。安装 = 下方 install-split
        // 主按钮，本会话允许收在其下拉首项；此处只补拒绝，替换普通「关闭」——关闭窗口本身不算决定（op 挂起至 TTL/断开）。
        <Button
          data-testid="external-access-reject"
          variant="outline"
          size={size}
          autoFocus={placement !== "sticky"}
          disabled={busy}
          onClick={onExternalAccessReject}
        >
          {t("external_access:decision_reject")}
        </Button>
      ) : isUpdate ? (
        <div className="flex">
          <Button
            data-testid="close-primary"
            variant="outline"
            size={size}
            onClick={() => onClose()}
            className="rounded-r-none"
          >
            {t("common:close")}
          </Button>
          <MoreMenu
            testid="close-more"
            label={t("install:close_update_script_no_more_update")}
            variant="outline"
            size={iconSize}
            triggerClassName="rounded-l-none border-l-0"
          >
            <DropdownMenuItem onSelect={() => onClose({ noMoreUpdates: true })}>
              {t("install:close_update_script_no_more_update")}
            </DropdownMenuItem>
          </MoreMenu>
        </div>
      ) : (
        <Button data-testid="close-primary" variant="outline" size={size} onClick={() => onClose()}>
          {t("common:close")}
        </Button>
      )}

      <div className="flex">
        <Button
          data-testid="install-primary"
          size={size}
          disabled={primaryDisabled || busy}
          onClick={() => onInstall()}
          className={cn(
            "gap-1.5 rounded-r-none duration-350",
            // 已安装态靠 ✓ 与绿色本身表达「完成」，禁用态的半透明会把这个信号糊掉
            phase === "installed" && "bg-success text-success-foreground hover:bg-success disabled:opacity-100"
          )}
        >
          <PrimaryIcon className={cn("size-4", phase === "installing" && "animate-spin")} />
          {primaryLabel}
        </Button>
        <MoreMenu
          testid="install-more"
          label={primaryLabel}
          variant="default"
          size={iconSize}
          disabled={primaryDisabled || busy}
          triggerClassName={cn("rounded-l-none border-l border-primary-foreground/25")}
        >
          {onExternalAccessSessionAllow && (
            <DropdownMenuItem onSelect={onExternalAccessSessionAllow}>
              <History className="size-4" />
              {t("external_access:decision_update_session_allow")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => onInstall({ closeAfterInstall: false })}>{noCloseLabel}</DropdownMenuItem>
          {!isSubscribe && (
            <DropdownMenuItem onSelect={() => onInstall({ noMoreUpdates: true })}>{noMoreUpdateLabel}</DropdownMenuItem>
          )}
        </MoreMenu>
      </div>
    </div>
  );
}
