import React, { useEffect } from "react";
import { Code, Database, Folder, Menu as MenuIcon, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@App/pkg/utils/cn";
import { isMacOS } from "@App/pkg/utils/shortcut";
import EditorMenu, { type EditorCommand, type SubView } from "./EditorMenu";

export type { EditorCommand, SubView } from "./EditorMenu";

export interface EditorToolbarProps {
  subView: SubView;
  onSubView: (v: SubView) => void;
  hasActive: boolean;
  canRun: boolean;
  onSave: () => void;
  onSaveAs: () => void;
  onRun: () => void;
  onCommand: (cmd: EditorCommand) => void;
  onPreloadSubView?: (v: SubView) => void;
  scriptListCollapsed: boolean;
  onToggleScriptList: () => void;
}

function EditorToolbar(props: EditorToolbarProps) {
  const { t } = useTranslation();
  const {
    subView,
    onSubView,
    hasActive,
    canRun,
    onSave,
    onSaveAs,
    onRun,
    onCommand,
    onPreloadSubView,
    scriptListCollapsed,
    onToggleScriptList,
  } = props;
  const mac = isMacOS();

  useEffect(() => {
    // 面板开关是全局动作，走捕获阶段：Monaco 或输入框持有焦点时也要能切换，
    // 同时阻止浏览器把 Ctrl+B 当成自己的快捷键（如 Firefox 书签栏）。
    // Mac 只认 ⌘B —— ⌃B 在 macOS 文本编辑中是「光标左移」，抢占会破坏输入。
    const onKeyDown = (e: KeyboardEvent) => {
      // 认 e.key 也认 e.code：非拉丁布局下物理 B 键的 e.key 是本地字符（俄文为「и」），
      // 只看 e.key 会让这些用户完全按不出快捷键；只看 e.code 又会让重映射键位（Dvorak）的
      // 用户按不出他键帽上标的那个 B。两者取其一命中即可。
      const isB = e.code === "KeyB" || e.key.toLowerCase() === "b";
      if (!isB || e.altKey || e.shiftKey) return;
      const primary = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (!primary) return;
      e.preventDefault();
      if (e.repeat) return;
      onToggleScriptList();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mac, onToggleScriptList]);

  const tabBtn = (v: SubView, label: string, Icon: typeof Code, title?: string) => (
    <button
      type="button"
      title={title}
      onClick={() => onSubView(v)}
      onPointerEnter={() => onPreloadSubView?.(v)}
      onFocus={() => onPreloadSubView?.(v)}
      className={cn(
        "flex items-center gap-1.5 border-b-2 pt-[2px] px-2.5 text-xs",
        subView === v
          ? "border-b-primary font-medium text-primary"
          : "border-b-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );

  return (
    <div className="flex h-10 shrink-0 items-stretch gap-1 border-b border-border bg-card px-2">
      <EditorMenu
        hover
        align="start"
        hasActive={hasActive}
        canRun={canRun}
        onSave={onSave}
        onSaveAs={onSaveAs}
        onRun={onRun}
        onCommand={onCommand}
        onSettings={() => onSubView("setting")}
        scriptListCollapsed={scriptListCollapsed}
        onToggleScriptList={onToggleScriptList}
        triggerIcon={<MenuIcon className="size-4" />}
        triggerClassName="flex relative size-7 items-center justify-center self-center rounded text-muted-foreground hover:bg-accent hover:text-foreground hover:z-9 disabled:opacity-40"
      />

      <div className="mx-1 h-4 w-px self-center bg-border" />

      {tabBtn("code", t("editor:code"), Code)}
      {tabBtn("storage", t("editor:storage"), Database, t("editor:script_storage_tooltip"))}
      {tabBtn("resource", t("editor:resource"), Folder, t("editor:script_resource_tooltip"))}
      {tabBtn("setting", t("editor:script_setting"), SlidersHorizontal, t("editor:script_setting_tooltip"))}
    </div>
  );
}
export default React.memo(EditorToolbar);
