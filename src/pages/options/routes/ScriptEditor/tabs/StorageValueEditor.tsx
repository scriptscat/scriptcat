import { editor } from "monaco-editor";
import { useEffect, useRef } from "react";
import { useTheme } from "@App/pages/components/theme-provider";
import { resolveMonacoTheme } from "@App/pages/components/CodeEditor/theme";
import { registerEditor } from "@App/pkg/utils/monaco-editor";
import { cn } from "@App/pkg/utils/cn";

type StorageValueEditorLanguage = "json" | "plaintext";

type StorageValueEditorProps = {
  id: string;
  value: string;
  language: StorageValueEditorLanguage;
  ariaLabel: string;
  className?: string;
  onChange: (value: string) => void;
};

export function StorageValueEditor({ id, value, language, ariaLabel, className, onChange }: StorageValueEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    onChangeRef.current = onChange;
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
      wordWrap: "on",
      wrappingIndent: "indent",
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

    return () => {
      changeListener.dispose();
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
      role="textbox"
      aria-label={ariaLabel}
      className={cn("min-h-56 overflow-hidden rounded-md border border-input", className)}
    />
  );
}
