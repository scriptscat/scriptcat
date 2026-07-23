import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Download, Eye, EyeOff, History, Info, RefreshCw } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@App/pages/components/ui/dropdown-menu";
import { cn } from "@App/pkg/utils/cn";

export interface InstallActionsProps {
  isUpdate: boolean;
  /** 脚本在回收站中：主按钮由「安装/更新」改为「还原/还原并更新」 */
  inTrash?: boolean;
  /** 回收站态下页面版本与回收站里那份是否不同，决定「还原」还是「还原并更新」 */
  versionChanged?: boolean;
  isSubscribe: boolean;
  primaryDisabled?: boolean;
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
  triggerClassName,
  disabled,
  children,
}: {
  testid: string;
  label: string;
  variant: "default" | "outline";
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
          size="icon"
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
  isUpdate,
  inTrash,
  versionChanged,
  isSubscribe,
  primaryDisabled,
  localFile,
  watching,
  onInstall,
  onClose,
  onToggleWatch,
  onExternalAccessReject,
  onExternalAccessSessionAllow,
}: InstallActionsProps) {
  const { t } = useTranslation(["install", "common", "editor", "external_access"]);

  const primaryLabel = inTrash
    ? versionChanged
      ? t("install:btn_restore_update")
      : t("install:btn_restore")
    : isUpdate
      ? t("install:update_script")
      : t("install:script");
  const noCloseLabel = isUpdate ? t("install:update_script_no_close") : t("install:script_no_close");
  const noMoreUpdateLabel = isUpdate ? t("install:update_script_no_more_update") : t("install:script_no_more_update");
  const PrimaryIcon = isUpdate ? RefreshCw : Download;

  const note = watching
    ? t("install:action_note_watching")
    : isUpdate
      ? t("install:action_note_update")
      : isSubscribe
        ? t("install:action_note_subscribe")
        : t("install:action_note_install");

  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <span
        data-testid="action-bar-note"
        className="hidden min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground md:flex"
      >
        <Info className="size-[15px] shrink-0" />
        <span className="truncate">{note}</span>
      </span>
      <div className="flex items-center gap-2 max-md:w-full max-md:justify-end md:ml-auto">
        {localFile && (
          <Button
            data-testid="watch-toggle"
            variant={watching ? "default" : "outline"}
            title={t("editor:watch_file_description")}
            onClick={onToggleWatch}
            className="gap-1.5"
          >
            {watching ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {watching ? t("editor:stop_watch_file") : t("editor:watch_file")}
          </Button>
        )}

        {onExternalAccessReject ? (
          // 「外部接入」触发：三档决策 拒绝 / 本会话允许 / 安装（设计 §3）。安装 = 下方 install-split
          // 主按钮；此处只补前两档，替换普通「关闭」——关闭窗口本身不算决定（op 挂起至 TTL/断开）。
          <>
            <Button data-testid="external-access-reject" variant="outline" autoFocus onClick={onExternalAccessReject}>
              {t("external_access:decision_reject")}
            </Button>
            {onExternalAccessSessionAllow && (
              <Button
                data-testid="external-access-session-allow"
                variant="secondary"
                className="gap-1.5 font-medium text-primary"
                onClick={onExternalAccessSessionAllow}
              >
                <History className="size-4" />
                {t("external_access:decision_session_allow")}
              </Button>
            )}
          </>
        ) : isUpdate ? (
          <div className="flex">
            <Button data-testid="close-primary" variant="outline" onClick={() => onClose()} className="rounded-r-none">
              {t("common:close")}
            </Button>
            <MoreMenu
              testid="close-more"
              label={t("install:close_update_script_no_more_update")}
              variant="outline"
              triggerClassName="rounded-l-none border-l-0"
            >
              <DropdownMenuItem onSelect={() => onClose({ noMoreUpdates: true })}>
                {t("install:close_update_script_no_more_update")}
              </DropdownMenuItem>
            </MoreMenu>
          </div>
        ) : (
          <Button data-testid="close-primary" variant="outline" onClick={() => onClose()}>
            {t("common:close")}
          </Button>
        )}

        <div className="flex">
          <Button
            data-testid="install-primary"
            disabled={primaryDisabled}
            onClick={() => onInstall()}
            className="gap-1.5 rounded-r-none"
          >
            <PrimaryIcon className="size-4" />
            {primaryLabel}
          </Button>
          <MoreMenu
            testid="install-more"
            label={primaryLabel}
            variant="default"
            disabled={primaryDisabled}
            triggerClassName={cn("rounded-l-none border-l border-primary-foreground/25")}
          >
            <DropdownMenuItem onSelect={() => onInstall({ closeAfterInstall: false })}>{noCloseLabel}</DropdownMenuItem>
            {!isSubscribe && (
              <DropdownMenuItem onSelect={() => onInstall({ noMoreUpdates: true })}>
                {noMoreUpdateLabel}
              </DropdownMenuItem>
            )}
          </MoreMenu>
        </div>
      </div>
    </div>
  );
}
