import React from "react";
import {
  ArrowLeft,
  Code,
  Database,
  Folder,
  MoreVertical,
  Play,
  Redo2,
  Save,
  Search,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@App/pkg/utils/cn";
import EditorMenu, { type EditorCommand, type SubView } from "./EditorMenu";

export interface MobileEditorProps {
  title: string;
  subView: SubView;
  onSubView: (v: SubView) => void;
  hasActive: boolean;
  canRun: boolean;
  onBack: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onRun: () => void;
  onCommand: (cmd: EditorCommand) => void;
  onPreloadSubView?: (v: SubView) => void;
  children: React.ReactNode;
}

function MobileEditor(props: MobileEditorProps) {
  const { t } = useTranslation();
  const {
    title,
    subView,
    onSubView,
    hasActive,
    canRun,
    onBack,
    onSave,
    onSaveAs,
    onRun,
    onCommand,
    onPreloadSubView,
    children,
  } = props;

  const subTab = (v: SubView, label: string, Icon: typeof Code) => (
    <button
      type="button"
      onClick={() => onSubView(v)}
      onPointerEnter={() => onPreloadSubView?.(v)}
      onFocus={() => onPreloadSubView?.(v)}
      className={cn(
        "flex shrink-0 items-center gap-1.5 border-b-2 pt-[2px] px-4 py-2.5 text-sm",
        subView === v ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* 顶栏 */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-card px-2">
        <button
          type="button"
          aria-label={t("editor:back")}
          onClick={onBack}
          className="flex size-9 items-center justify-center rounded text-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{title}</span>
        <button
          type="button"
          aria-label={t("editor:save")}
          onClick={onSave}
          disabled={!hasActive}
          className="flex size-9 items-center justify-center rounded bg-primary-background text-primary-foreground disabled:opacity-40"
        >
          <Save className="size-4" />
        </button>
        <EditorMenu
          align="end"
          hasActive={hasActive}
          canRun={canRun}
          onSave={onSave}
          onSaveAs={onSaveAs}
          onRun={onRun}
          onCommand={onCommand}
          onSettings={() => onSubView("setting")}
          triggerIcon={<MoreVertical className="size-5" />}
          triggerClassName="flex size-9 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-40"
        />
      </div>

      {/* 子视图标签（横向滚动） */}
      <div className="flex shrink-0 items-stretch overflow-x-auto border-b border-border bg-card scrollbar-none">
        {subTab("code", t("editor:code"), Code)}
        {subTab("storage", t("editor:storage"), Database)}
        {subTab("resource", t("editor:resource"), Folder)}
        {subTab("setting", t("editor:script_setting"), SlidersHorizontal)}
      </div>

      {/* 编辑区（children 自带 flex-1，作为列布局的直接弹性子项填满中部） */}
      {children}

      {/* 底部工具栏：仅代码视图下展示（运行/撤销/重做/查找 均针对代码编辑器） */}
      {subView === "code" && (
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {/* 运行按钮仅后台/定时脚本可见，普通脚本无运行入口 */}
          {canRun && (
            <button
              type="button"
              onClick={onRun}
              disabled={!hasActive}
              className="flex items-center gap-1.5 rounded-md bg-primary-background px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              <Play className="size-4" />
              {t("editor:run")}
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            aria-label={t("editor:undo")}
            onClick={() => onCommand("undo")}
            className="flex size-9 items-center justify-center rounded-md bg-secondary text-foreground"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t("editor:redo")}
            onClick={() => onCommand("redo")}
            className="flex size-9 items-center justify-center rounded-md bg-secondary text-foreground"
          >
            <Redo2 className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t("editor:find")}
            onClick={() => onCommand("find")}
            className="flex size-9 items-center justify-center rounded-md bg-secondary text-foreground"
          >
            <Search className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
export default React.memo(MobileEditor);
