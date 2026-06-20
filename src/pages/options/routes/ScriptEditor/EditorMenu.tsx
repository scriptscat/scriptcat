import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatShortcut, isMacOS } from "@App/pkg/utils/shortcut";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@App/pages/components/ui/dropdown-menu";
import { useHoverMenu } from "@App/pages/components/ui/use-hover-menu";

export type SubView = "code" | "storage" | "resource" | "setting";
export type EditorCommand = "undo" | "redo" | "cut" | "copy" | "paste" | "find" | "replace" | "selectAll" | "format";

export interface EditorMenuProps {
  hasActive: boolean;
  onSave: () => void;
  onSaveAs: () => void;
  onRun: () => void;
  onCommand: (cmd: EditorCommand) => void;
  onSettings: () => void;
  /** 桌面端用 hover 展开（受控菜单）；移动端用点按展开（非受控菜单，默认） */
  hover?: boolean;
  align?: "start" | "end";
  triggerIcon: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
}

/**
 * 编辑器「文件 / 编辑 / 运行 / 设置」二级菜单，桌面端工具栏与移动端外壳共用同一份命令定义，
 * 避免两端菜单各自维护导致命令漂移。
 */
export default function EditorMenu(props: EditorMenuProps) {
  const { t } = useTranslation();
  const {
    hasActive,
    onSave,
    onSaveAs,
    onRun,
    onCommand,
    onSettings,
    hover = false,
    align = "start",
    triggerIcon,
    triggerClassName,
    triggerLabel,
  } = props;
  const { close, rootProps, hoverProps, contentProps } = useHoverMenu();
  const mac = isMacOS();
  // 替换在 Monaco 中的实际键位随平台不同：Mac 为 ⌥⌘F，Windows/Linux 为 Ctrl+H
  const replaceKeys = mac ? ["mod", "alt", "F"] : ["mod", "H"];

  // 桌面端为受控 hover 菜单，选中后需手动 close（Radix 自身的关闭被 useHoverMenu 拦截）；
  // 移动端为非受控点按菜单，Radix 选中后自行关闭。
  const itemProps = (fn: () => void): { onClick?: () => void; onSelect?: (e: Event) => void } =>
    hover
      ? {
          onClick: () => {
            close();
            fn();
          },
        }
      : { onSelect: () => fn() };

  // hover 相关的 props 仅在桌面端生效
  const hoverOnly = hover ? hoverProps : {};

  return (
    <DropdownMenu {...(hover ? rootProps : {})}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={triggerLabel ?? t("editor:more")}
          disabled={!hasActive}
          className={triggerClassName}
          {...hoverOnly}
        >
          {triggerIcon}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-40" {...(hover ? contentProps : {})}>
        {/* 文件 */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("editor:file")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52" {...hoverOnly}>
            <DropdownMenuItem {...itemProps(onSave)}>
              {t("editor:save")}
              <DropdownMenuShortcut>{formatShortcut(["mod", "S"], mac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem {...itemProps(onSaveAs)}>
              {t("editor:save_as")}
              <DropdownMenuShortcut>{formatShortcut(["mod", "shift", "S"], mac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* 编辑 */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("editor:edit")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52" {...hoverOnly}>
            <DropdownMenuItem {...itemProps(() => onCommand("undo"))}>
              {t("editor:undo")}
              <DropdownMenuShortcut>{formatShortcut(["mod", "Z"], mac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem {...itemProps(() => onCommand("redo"))}>
              {t("editor:redo")}
              <DropdownMenuShortcut>{formatShortcut(["mod", "shift", "Z"], mac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem {...itemProps(() => onCommand("cut"))}>
              {t("editor:cut")}
              <DropdownMenuShortcut>{formatShortcut(["mod", "X"], mac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem {...itemProps(() => onCommand("copy"))}>
              {t("editor:copy")}
              <DropdownMenuShortcut>{formatShortcut(["mod", "C"], mac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem {...itemProps(() => onCommand("paste"))}>
              {t("editor:paste")}
              <DropdownMenuShortcut>{formatShortcut(["mod", "V"], mac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem {...itemProps(() => onCommand("find"))}>
              {t("editor:find")}
              <DropdownMenuShortcut>{formatShortcut(["mod", "F"], mac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem {...itemProps(() => onCommand("replace"))}>
              {t("editor:replace")}
              <DropdownMenuShortcut>{formatShortcut(replaceKeys, mac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem {...itemProps(() => onCommand("selectAll"))}>
              {t("editor:select_all")}
              <DropdownMenuShortcut>{formatShortcut(["mod", "A"], mac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem {...itemProps(() => onCommand("format"))}>
              {t("editor:format")}
              <DropdownMenuShortcut>{formatShortcut(["mod", "shift", "F"], mac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* 运行 */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("editor:run")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52" {...hoverOnly}>
            <DropdownMenuItem {...itemProps(onRun)}>
              {t("editor:run")}
              <DropdownMenuShortcut>{formatShortcut(["mod", "F5"], mac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuItem {...itemProps(onSettings)}>{t("editor:settings")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
