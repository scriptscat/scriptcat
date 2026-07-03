import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeXml, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import CodeEditor from "@App/pages/components/CodeEditor";

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

  const lineCount = useMemo(() => code.split("\n").length, [code]);
  // diffCode 语义:""=无 diff(普通只读预览),有值=内联 diff;切勿传 undefined(表示不加载)
  const diffCode = oldCode && oldCode !== code ? oldCode : "";

  const copy = () => {
    void navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <CodeXml className="size-4 text-fg-secondary" />
        <span className="text-sm font-semibold text-foreground">{t("editor:code")}</span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-fg-secondary">{language}</span>
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
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {copied ? <Check className="size-4 text-success-fg" /> : <Copy className="size-4" />}
          </button>
          <button
            type="button"
            data-testid="code-toggle"
            aria-label={collapsed ? t("install:code_expand") : t("install:code_collapse")}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>
      {!collapsed && (
        <CodeEditor
          id="install-code-preview"
          code={code}
          diffCode={diffCode}
          editable={false}
          className="h-[340px] w-full"
        />
      )}
    </section>
  );
}
