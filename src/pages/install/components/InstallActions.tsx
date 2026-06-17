import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Eye, EyeOff, ShieldAlert } from "lucide-react";
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
  isSubscribe: boolean;
  primaryDisabled?: boolean;
  localFile?: boolean;
  watching?: boolean;
  onInstall: (opts?: { closeAfterInstall?: boolean; noMoreUpdates?: boolean }) => void;
  onClose: (opts?: { noMoreUpdates?: boolean }) => void;
  onToggleWatch?: () => void;
}

/**
 * 拆分按钮的「更多」下拉。受控展开:onPointerDown 阻断 Radix 自身的指针展开,
 * 改由 onClick 切换 open —— 在 jsdom 与真实浏览器中行为一致(避免指针/点击双触发)。
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
  isSubscribe,
  primaryDisabled,
  localFile,
  watching,
  onInstall,
  onClose,
  onToggleWatch,
}: InstallActionsProps) {
  const { t } = useTranslation(["install", "common", "editor"]);

  const primaryLabel = isUpdate ? t("install:update_script") : t("install:script");
  const noCloseLabel = isUpdate ? t("install:update_script_no_close") : t("install:script_no_close");
  const noMoreUpdateLabel = isUpdate ? t("install:update_script_no_more_update") : t("install:script_no_more_update");

  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldAlert className="size-4 shrink-0 text-warning-fg" />
        <span className="truncate">{t("install:from_legitimate_sources_warning")}</span>
      </p>

      <div className="flex items-center gap-2">
        {localFile && (
          <Button
            data-testid="watch-toggle"
            variant={watching ? "default" : "outline"}
            onClick={onToggleWatch}
            className="gap-1.5"
          >
            {watching ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {watching ? t("editor:stop_watch_file") : t("editor:watch_file")}
          </Button>
        )}

        {isUpdate ? (
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
            className="rounded-r-none"
          >
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
