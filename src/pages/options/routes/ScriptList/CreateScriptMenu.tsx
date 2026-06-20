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
import { useTranslation } from "react-i18next";
import { pickScriptFiles, pickSkillZip } from "./filePicker";
import { handleImportFiles, handleImportUrls } from "./importHandler";
import { LinkImportDialog } from "./LinkImportDialog";

/**
 * 新建脚本下拉(hover 触发)。Toolbar 用带文字按钮(variant="default"),
 * 移动 header 用 32×32 图标按钮(variant="icon")。含导入分组:本地/链接/Skill。
 */
export function CreateScriptMenu({ variant = "default" }: { variant?: "default" | "icon" }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { close, rootProps, hoverProps, contentProps } = useHoverMenu();
  // 移动端图标按钮用普通点击菜单（移动端无 hover；hover 触发 + dismiss 拦截会让菜单卡住关不掉），
  // 仅桌面带文字按钮使用 hover 展开。
  const isHoverMenu = variant === "default";
  const [linkOpen, setLinkOpen] = useState(false);

  const handleCreate = (path: string) => {
    close();
    navigate(path);
  };
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
              className="h-8 w-8 shrink-0 rounded-md"
              aria-label={t("script:create_script")}
            >
              <Plus className="w-4 h-4" />
            </Button>
          ) : (
            <Button size="sm" data-testid="create-script" className="gap-1.5 h-[34px] px-4" {...hoverProps}>
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
          <DropdownMenuItem onClick={() => handleCreate("/script/editor")}>
            {t("script:create_user_script")}
          </DropdownMenuItem>
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
