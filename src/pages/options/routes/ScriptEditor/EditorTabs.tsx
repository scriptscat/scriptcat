import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { i18nName } from "@App/locales/locales";
import { cn } from "@App/pkg/utils/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { useHoverMenu } from "@App/pages/components/ui/use-hover-menu";
import type { EditorTab } from "./useEditorTabs";

export interface EditorTabsProps {
  tabs: EditorTab[];
  activeUuid: string | null;
  onActivate: (uuid: string) => void;
  onClose: (uuid: string) => void;
  onCloseOthers: (uuid: string) => void;
  onCloseLeft: (uuid: string) => void;
  onCloseRight: (uuid: string) => void;
  /** 不传模板即沿用页面默认模板（URL template 参数） */
  onNew: (template?: string) => void;
}

interface MenuState {
  x: number;
  y: number;
  uuid: string;
}

function EditorTabs(props: EditorTabsProps) {
  const { t } = useTranslation();
  const { tabs, activeUuid, onActivate, onClose, onCloseOthers, onCloseLeft, onCloseRight, onNew } = props;
  const [menu, setMenu] = useState<MenuState | null>(null);
  const { close, rootProps, hoverProps, contentProps } = useHoverMenu();

  const handleNew = (template: string) => {
    close();
    onNew(template);
  };

  const menuItems = menu
    ? [
        { label: t("editor:close_current_tab"), action: () => onClose(menu.uuid) },
        { label: t("editor:close_other_tabs"), action: () => onCloseOthers(menu.uuid) },
        { label: t("editor:close_left_tabs"), action: () => onCloseLeft(menu.uuid) },
        { label: t("editor:close_right_tabs"), action: () => onCloseRight(menu.uuid) },
      ]
    : [];

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card pl-3 scrollbar-none">
      {tabs.map((tab) => {
        const isActive = tab.uuid === activeUuid;
        return (
          <div
            key={tab.uuid}
            onClick={() => onActivate(tab.uuid)}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(tab.uuid); // 中键关闭
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, uuid: tab.uuid });
            }}
            className={cn(
              "group/tab flex max-w-[180px] cursor-pointer items-center gap-1.5 border-r border-b-2 pt-[2px] border-border px-3 text-xs",
              isActive ? "border-b-primary text-primary" : "border-b-transparent text-muted-foreground hover:bg-accent"
            )}
          >
            {tab.isChanged && <span className="size-1.5 shrink-0 rounded-full bg-warning" />}
            <span className="truncate" title={i18nName(tab.script)}>
              {i18nName(tab.script)}
            </span>
            <button
              type="button"
              aria-label={t("editor:close_current_tab")}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.uuid);
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded opacity-0 hover:bg-muted-foreground/20 group-hover/tab:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      {/* hover 弹出脚本类型选择（同「新建脚本」下拉）；直接点击仍按默认模板快速新建 */}
      <DropdownMenu {...rootProps}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("editor:new_script")}
            onClick={() => {
              close();
              onNew();
            }}
            className="flex w-9 shrink-0 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
            {...hoverProps}
          >
            <Plus className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" {...contentProps}>
          <DropdownMenuItem onClick={() => handleNew("")}>{t("script:create_user_script")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleNew("background")}>
            {t("script:create_background_script")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleNew("crontab")}>
            {t("script:create_scheduled_script")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => e.preventDefault()} />
          <div
            className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover py-1 shadow-md"
            style={{ left: menu.x, top: menu.y }}
          >
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent"
                onClick={() => {
                  item.action();
                  setMenu(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
export default React.memo(EditorTabs);
