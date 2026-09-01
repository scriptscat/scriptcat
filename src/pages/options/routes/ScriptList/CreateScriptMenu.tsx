import type React from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ChevronDown } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { useHoverMenu } from "@App/pages/components/ui/use-hover-menu";
import { useCanHover } from "@App/pages/components/use-can-hover";
import { useTranslation } from "react-i18next";
import { pickScriptFiles, pickSkillZip } from "./filePicker";
import { handleImportFiles, handleImportUrls } from "./importHandler";
import { LinkImportDialog } from "./LinkImportDialog";

/**
 * 新建脚本入口。Toolbar 用带文字按钮(variant="default"),移动 header 用 32×32 图标按钮(variant="icon")。
 * 仅在「带文字按钮 + 指针支持 hover」时走 hover 菜单:点击直接新建用户脚本,菜单由 hover / ArrowDown 展开;
 * 其余情况(图标按钮、触摸屏)一律点击展开菜单。含导入分组:本地/链接/Skill。
 */
export function CreateScriptMenu({ variant = "default" }: { variant?: "default" | "icon" }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { close, rootProps, hoverProps, contentProps } = useHoverMenu();
  // 图标按钮和触摸屏都用普通点击菜单（无 hover；hover 触发 + dismiss 拦截会让菜单卡住关不掉），
  // 仅「桌面带文字按钮 + 指针可 hover」使用 hover 展开。
  // 触摸屏的桌面视口（平板横屏、触屏笔记本）若也走 hover，菜单会完全够不着。
  const canHover = useCanHover();
  const isHoverMenu = variant === "default" && canHover;
  const [linkOpen, setLinkOpen] = useState(false);

  const handleCreate = (path: string) => {
    close();
    void navigate(path);
  };
  const createUserScript = () => handleCreate("/script/editor");
  // hover 菜单下按钮的激活语义归「新建用户脚本」。Radix Trigger 用 composeEventHandlers 挂载「切换菜单」,
  // 遇到 defaultPrevented 会跳过,故在此拦掉:否则 hover 已展开时点击只会把菜单收起,看起来像点了没反应(#1699)。
  // Enter/Space 同理自行接管(Radix 会 preventDefault 吃掉原生 click);ArrowDown 不拦,留给 Radix 展开菜单。
  const triggerActionProps = isHoverMenu
    ? {
        ...hoverProps,
        onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
        onClick: createUserScript,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            createUserScript();
          }
        },
      }
    : {};
  const importLocal = async () => {
    close();
    const items = await pickScriptFiles();
    if (items.length) await handleImportFiles(items);
  };
  const importSkill = async () => {
    close();
    const items = await pickSkillZip();
    if (items.length) await handleImportFiles(items);
  };

  return (
    <>
      <DropdownMenu {...(isHoverMenu ? rootProps : {})}>
        <DropdownMenuTrigger asChild>
          {variant === "icon" ? (
            <Button
              size="icon"
              data-testid="create-script"
              data-tour="m-install"
              className="h-8 w-8 shrink-0 rounded-md"
              aria-label={t("script:create_script")}
            >
              <Plus className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              data-testid="create-script"
              data-tour="install-entry"
              className="gap-1.5 h-[34px] px-4"
              {...triggerActionProps}
            >
              <Plus className="w-4 h-4" />
              <span className="text-[13px] font-medium">{t("script:create_script")}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" {...(isHoverMenu ? contentProps : {})}>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            {t("script:create_group")}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={createUserScript}>{t("script:create_user_script")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleCreate("/script/editor?template=background")}>
            {t("script:create_background_script")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleCreate("/script/editor?template=crontab")}>
            {t("script:create_scheduled_script")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            {t("script:import_group")}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={importLocal}>{t("script:import_local_script")}</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              close();
              setLinkOpen(true);
            }}
          >
            {t("script:link_import")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={importSkill}>{t("script:import_skill")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LinkImportDialog open={linkOpen} onOpenChange={setLinkOpen} onSubmit={handleImportUrls} />
    </>
  );
}
