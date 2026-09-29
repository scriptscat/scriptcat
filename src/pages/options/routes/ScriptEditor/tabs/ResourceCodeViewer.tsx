import { editor } from "monaco-editor";
import { useEffect, useRef } from "react";
import { useTheme } from "@App/pages/components/theme-provider";
import { resolveMonacoTheme } from "@App/pages/components/CodeEditor/theme";
import { registerEditor } from "@App/pkg/utils/monaco-editor";
import { cn } from "@App/pkg/utils/cn";

type ResourceCodeViewerProps = {
  value: string;
  language: string;
  ariaLabel: string;
  className?: string;
};

export function ResourceCodeViewer({ value, language, ariaLabel, className }: ResourceCodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    registerEditor();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const instance = editor.create(containerRef.current, {
      value,
      language,
      readOnly: true,
      domReadOnly: true,
      theme: resolveMonacoTheme(resolvedTheme),
      ariaLabel,
      automaticLayout: true,
      fixedOverflowWidgets: true,
      minimap: { enabled: false },
      scrollbar: { alwaysConsumeMouseWheel: false },
      overviewRulerBorder: false,
      scrollBeyondLastLine: false,
      wordWrap: "on",
      wrappingIndent: "indent",
      glyphMargin: false,
      lineNumbersMinChars: 3,
      folding: true,
      renderLineHighlight: "none",
      renderControlCharacters: true,
      unicodeHighlight: { ambiguousCharacters: false },
      largeFileOptimizations: true,
      accessibilitySupport: "auto",
    });

    return () => instance.dispose();
    // 主题由下方 effect 全局切换，不因主题变化重建实例
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, language, ariaLabel]);

  useEffect(() => {
    editor.setTheme(resolveMonacoTheme(resolvedTheme));
  }, [resolvedTheme]);

  return <div ref={containerRef} className={cn("overflow-hidden rounded-md border border-border", className)} />;
}
