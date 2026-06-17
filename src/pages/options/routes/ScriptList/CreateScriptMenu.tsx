import { useNavigate } from "react-router-dom";
import { Plus, ChevronDown } from "lucide-react";
import { Button } from "@App/pages/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { useHoverMenu } from "@App/pages/components/ui/use-hover-menu";
import { t } from "@App/locales/locales";

/**
 * 新建脚本下拉(hover 触发)。Toolbar 用带文字按钮(variant="default"),
 * 移动 header 用 32×32 图标按钮(variant="icon")。
 */
export function CreateScriptMenu({ variant = "default" }: { variant?: "default" | "icon" }) {
  const navigate = useNavigate();
  const { close, rootProps, hoverProps, contentProps } = useHoverMenu();

  const handleCreate = (path: string) => {
    close();
    navigate(path);
  };

  return (
    <DropdownMenu {...rootProps}>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 rounded-md"
            aria-label={t("script:create_script")}
            {...hoverProps}
          >
            <Plus className="w-4 h-4" />
          </Button>
        ) : (
          <Button size="sm" className="gap-1.5 h-[34px] px-4" {...hoverProps}>
            <Plus className="w-4 h-4" />
            <span className="text-[13px] font-medium">{t("script:create_script")}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" {...contentProps}>
        <DropdownMenuItem onClick={() => handleCreate("/script/editor")}>
          {t("script:create_user_script")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCreate("/script/editor?template=background")}>
          {t("script:create_background_script")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCreate("/script/editor?template=crontab")}>
          {t("script:create_scheduled_script")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
