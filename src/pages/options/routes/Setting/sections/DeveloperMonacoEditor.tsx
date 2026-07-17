import { editor } from "monaco-editor";
import { useEffect, useRef } from "react";
import { useTheme } from "@App/pages/components/theme-provider";
import { resolveMonacoTheme } from "@App/pages/components/CodeEditor/theme";
import { registerEditor } from "@App/pkg/utils/monaco-editor";
import { cn } from "@App/pkg/utils/cn";

type DeveloperMonacoLanguage = "json" | "typescript";

type DeveloperMonacoEditorProps = {
  id: string;
  value: string;
  language: DeveloperMonacoLanguage;
  ariaLabel: string;
  className?: string;
  "data-testid"?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
};

export function DeveloperMonacoEditor({
  id,
  value,
  language,
  ariaLabel,
  className,
  "data-testid": testId,
  onChange,
  onBlur,
}: DeveloperMonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
  });

  useEffect(() => {
    registerEditor();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const instance = editor.create(containerRef.current, {
      value,
      language,
      theme: resolveMonacoTheme(resolvedTheme),
      automaticLayout: true,
      fixedOverflowWidgets: true,
      minimap: { enabled: false },
      scrollbar: { alwaysConsumeMouseWheel: false },
      overviewRulerBorder: false,
      scrollBeyondLastLine: false,
      tabSize: 2,
      insertSpaces: true,
      wordWrap: "off",
      glyphMargin: false,
      lineNumbersMinChars: 3,
      folding: true,
      renderLineHighlight: "line",
      renderWhitespace: "selection",
      renderControlCharacters: true,
      unicodeHighlight: { ambiguousCharacters: false },
      accessibilitySupport: "auto",
    });
    editorRef.current = instance;

    const changeListener = instance.onDidChangeModelContent(() => {
      onChangeRef.current(instance.getValue());
    });
    const blurListener = instance.onDidBlurEditorWidget(() => {
      onBlurRef.current();
    });

    return () => {
      changeListener.dispose();
      blurListener.dispose();
      instance.dispose();
      editorRef.current = undefined;
    };
    // 创建实例只依赖编辑器身份与语言；value/theme 由独立 effect 同步，避免每次输入重建。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, language]);

  useEffect(() => {
    const instance = editorRef.current;
    if (!instance) return;
    if (instance.getValue() !== value) {
      instance.setValue(value);
    }
  }, [value]);

  useEffect(() => {
    editor.setTheme(resolveMonacoTheme(resolvedTheme));
  }, [resolvedTheme]);

  return (
    <div
      ref={containerRef}
      id={id}
      data-testid={testId}
      aria-label={ariaLabel}
      className={cn("min-h-[320px] overflow-hidden rounded-md border border-input", className)}
    />
  );
}
