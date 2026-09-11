import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeXml, Copy, Check, ChevronDown, ChevronRight, Maximize2 } from "lucide-react";
import CodeEditor from "@App/pages/components/CodeEditor";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@App/pages/components/ui/dialog";
import { Skeleton } from "@App/pages/components/ui/skeleton";
import { cn } from "@App/pkg/utils/cn";

/** 代码形态的骨架：缩进与行宽错落，读起来像代码而不是一堆等长灰条 */
const CODE_SKELETON_LINES = [
  "w-[58%]",
  "ml-4 w-[74%]",
  "ml-4 w-[46%]",
  "ml-8 w-[66%]",
  "ml-4 w-[38%]",
  "w-[52%]",
  "ml-4 w-[62%]",
];

export interface CodePreviewProps {
  code: string;
  /** 更新态的旧版本代码;与 code 不同则触发内联 diff,全新安装为 undefined */
  oldCode?: string;
  language?: string;
  diffStat?: { added: number; removed: number };
  defaultCollapsed?: boolean;
}

export function CodePreview({
  code,
  oldCode,
  language = "JavaScript",
  diffStat,
  defaultCollapsed = false,
}: CodePreviewProps) {
  const { t } = useTranslation(["install", "common", "editor"]);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [copied, setCopied] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const lineCount = useMemo(() => code.split("\n").length, [code]);
  // diffCode 语义:""=无 diff(普通只读预览),有值=内联 diff;切勿传 undefined(表示不加载)
  const diffCode = oldCode && oldCode !== code ? oldCode : "";

  const copy = () => {
    void navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const setFullscreenMode = (open: boolean) => {
    setFullscreen(open);
    setEditorReady(false);
  };

  const codeEditor = (id: string) => (
    <CodeEditor
      id={id}
      code={code}
      diffCode={diffCode}
      editable={false}
      onEditorMount={() => setEditorReady(true)}
      className="h-full w-full"
    />
  );

  const editorSkeleton = (
    <div
      data-testid="code-skeleton"
      role="status"
      aria-busy="true"
      aria-label={t("install:code_loading")}
      className="absolute inset-0 flex flex-col gap-2.5 p-3"
    >
      {CODE_SKELETON_LINES.map((line, i) => (
        <Skeleton key={i} className={cn("h-3", line)} />
      ))}
    </div>
  );

  return (
    <Dialog open={fullscreen} onOpenChange={setFullscreenMode}>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
          <CodeXml className="size-4 text-fg-secondary" />
          <span className="text-sm font-semibold text-foreground">{t("editor:code")}</span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-fg-secondary">
            {language}
          </span>
          <span className="text-xs text-muted-foreground">{t("install:code_lines", { count: lineCount })}</span>
          {diffStat && (
            <span className="flex items-center gap-1.5 font-mono text-xs">
              <span className="text-success-fg">{`+${diffStat.added}`}</span>
              <span className="text-destructive">{`−${diffStat.removed}`}</span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              data-testid="code-copy"
              aria-label={t("install:code_copy")}
              onClick={copy}
              className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:size-7"
            >
              {copied ? <Check className="size-5 text-success-fg md:size-4" /> : <Copy className="size-5 md:size-4" />}
            </button>
            <DialogTrigger asChild>
              <button
                type="button"
                data-testid="code-fullscreen"
                aria-label={t("install:code_fullscreen")}
                aria-haspopup="dialog"
                className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:size-7"
              >
                <Maximize2 className="size-5 md:size-4" />
              </button>
            </DialogTrigger>
            <button
              type="button"
              data-testid="code-toggle"
              aria-label={collapsed ? t("install:code_expand") : t("install:code_collapse")}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((c) => !c)}
              className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:size-7"
            >
              {collapsed ? <ChevronRight className="size-5 md:size-4" /> : <ChevronDown className="size-5 md:size-4" />}
            </button>
          </div>
        </div>
        {!collapsed && !fullscreen && (
          <div className="relative h-[340px] w-full">
            {!editorReady && editorSkeleton}
            {codeEditor("install-code-preview")}
          </div>
        )}
        <DialogContent
          data-testid="code-fullscreen-dialog"
          aria-describedby={undefined}
          closeLabel={t("common:close")}
          className="left-0 top-0 flex h-dvh w-dvw max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0 sm:rounded-none [&>button]:size-11 md:[&>button]:size-8"
        >
          <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-border px-4 py-1.5 pr-16">
            <CodeXml aria-hidden="true" className="size-4 text-fg-secondary" />
            <DialogTitle className="truncate text-sm font-semibold">{t("editor:code")}</DialogTitle>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-fg-secondary">
              {language}
            </span>
            <span className="text-xs text-muted-foreground">{t("install:code_lines", { count: lineCount })}</span>
            {diffStat && (
              <span className="flex items-center gap-1.5 font-mono text-xs">
                <span className="text-success-fg">{`+${diffStat.added}`}</span>
                <span className="text-destructive">{`−${diffStat.removed}`}</span>
              </span>
            )}
            <button
              type="button"
              data-testid="code-copy-fullscreen"
              aria-label={t("install:code_copy")}
              onClick={copy}
              className="ml-auto flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:size-8"
            >
              {copied ? <Check className="size-5 text-success-fg md:size-4" /> : <Copy className="size-5 md:size-4" />}
            </button>
          </div>
          <div className="relative min-h-0 flex-1">
            {!editorReady && editorSkeleton}
            {codeEditor("install-code-preview-fullscreen")}
          </div>
        </DialogContent>
      </section>
    </Dialog>
  );
}
