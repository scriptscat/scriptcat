import React from "react";
import {
  Code,
  Database,
  Folder,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@App/pkg/utils/cn";
import EditorMenu, { type EditorCommand, type SubView } from "./EditorMenu";

export type { EditorCommand, SubView } from "./EditorMenu";

export interface EditorToolbarProps {
  subView: SubView;
  onSubView: (v: SubView) => void;
  hasActive: boolean;
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
    onSave,
    onSaveAs,
    onRun,
    onCommand,
    onPreloadSubView,
    scriptListCollapsed,
    onToggleScriptList,
  } = props;

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
        onSave={onSave}
        onSaveAs={onSaveAs}
        onRun={onRun}
        onCommand={onCommand}
        onSettings={() => onSubView("setting")}
        triggerIcon={<MenuIcon className="size-4" />}
        triggerClassName="flex relative size-7 items-center justify-center self-center rounded text-muted-foreground hover:bg-accent hover:text-foreground hover:z-9 disabled:opacity-40"
      />

      <div className="mx-1 h-4 w-px self-center bg-border" />

      {tabBtn("code", t("editor:code"), Code)}
      {tabBtn("storage", t("editor:storage"), Database, t("editor:script_storage_tooltip"))}
      {tabBtn("resource", t("editor:resource"), Folder, t("editor:script_resource_tooltip"))}
      {tabBtn("setting", t("editor:script_setting"), SlidersHorizontal, t("editor:script_setting_tooltip"))}

      <div className="flex-1" />

      <button
        type="button"
        aria-label={scriptListCollapsed ? t("editor:editor.show_script_list") : t("editor:editor.hide_script_list")}
        title={scriptListCollapsed ? t("editor:editor.show_script_list") : t("editor:editor.hide_script_list")}
        onClick={onToggleScriptList}
        className="flex size-7 items-center justify-center self-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {scriptListCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
      </button>
    </div>
  );
}
export default React.memo(EditorToolbar);
