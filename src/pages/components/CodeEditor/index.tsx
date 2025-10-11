// =============================
// File: src/pages/components/CodeEditor.tsx
// =============================
import { editor, Range } from "monaco-editor";
import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { globalCache, systemConfig } from "@App/pages/store/global";
import { LinterWorker } from "@App/pkg/utils/monaco-editor";

type Props = {
  uuid?: string;
  className?: string;
  id: string;
  editable?: boolean;
  // 👉 新增：直接接收當前要顯示的 model（每個分頁各自的 model，擁有獨立 undo 記錄）
  currentModel?: editor.ITextModel | null;
  // 當前內容改變時回調
  onChange?: (val: string) => void;
  // 首次就緒回調（回傳 editor 實例）
  onReady?: (e: editor.IStandaloneCodeEditor) => void;
};

const CodeEditor: React.ForwardRefRenderFunction<{ editor: editor.IStandaloneCodeEditor | undefined }, Props> = (
  { id, className, editable, currentModel, onChange, onReady },
  ref
) => {
  const [monacoEditor, setEditor] = useState<editor.IStandaloneCodeEditor>();
  const [enableEslint, setEnableEslint] = useState(false);
  const [eslintConfig, setEslintConfig] = useState("");
  const div = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ editor: monacoEditor }));

  useEffect(() => {
    const loadConfigs = () => {
      Promise.all([systemConfig.getEslintConfig(), systemConfig.getEnableEslint()]).then(
        ([eslintConfig, enableEslint]) => {
          setEslintConfig(eslintConfig);
          setEnableEslint(enableEslint);
        }
      );
    };
    loadConfigs();
  }, []);

  // ⚙️ 只建立「一個」 editor 實例（不再為每個分頁建立新 editor）
  useEffect(() => {
    if (!div.current || monacoEditor) return;
    const codeEditor = editor.create(div.current, {
      language: "javascript",
      theme: document.body.getAttribute("arco-theme") === "dark" ? "vs-dark" : "vs",
      folding: true,
      foldingStrategy: "indentation",
      automaticLayout: true,
      overviewRulerBorder: false,
      scrollBeyondLastLine: false,
      readOnly: !editable,
      glyphMargin: true,
      unicodeHighlight: { ambiguousCharacters: false },
    });
    setEditor(codeEditor);
    onReady?.(codeEditor);
    return () => {
      try {
        codeEditor.dispose();
      } finally {
        setEditor(undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [div]);

  // 🔁 當前分頁切換：只切換 model（保留各自 undo 記錄）
  useEffect(() => {
    if (!monacoEditor) return;
    if (!currentModel) return;
    // 設置當前 model
    monacoEditor.setModel(currentModel);
  }, [monacoEditor, currentModel]);

  // 內容改變回調
  useEffect(() => {
    if (!monacoEditor) return;
    const d1 = monacoEditor.onDidChangeModelContent(() => {
      const val = monacoEditor.getValue();
      onChange?.(val);
    });
    return () => {
      d1.dispose();
    };
  }, [monacoEditor, onChange]);

  // ESLint（沿用原本行為，轉為監聽當前 model）
  useEffect(() => {
    if (!enableEslint || !monacoEditor) return;
    const getModel = () => monacoEditor.getModel();

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const disposables: Array<{ dispose: () => void }> = [];

    const editorDisposeListener = monacoEditor.onDidDispose(() => {
      alive = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    });
    disposables.push({ dispose: () => editorDisposeListener.dispose() });

    const lint = () => {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!alive) return;
        const currentModel = getModel();
        if (!currentModel || (currentModel as any).isDisposed?.()) return;
        let parsed: any = {};
        try {
          parsed = JSON.parse(eslintConfig || "{}");
        } catch {
          parsed = {};
        }
        LinterWorker.sendLinterMessage({ code: currentModel.getValue(), id, config: parsed });
      }, 500);
    };

    // 初次/切換 model 時都觸發一次
    lint();
    const contentDisposable = monacoEditor.onDidChangeModelContent(lint);
    disposables.push({ dispose: () => contentDisposable.dispose() });

    const diffEslint = (makers: { startLineNumber: number; endLineNumber: number; severity: number }[]) => {
      if (!alive) return;
      const currentModel = getModel();
      if (!currentModel || (currentModel as any).isDisposed?.()) return;
      const glyphMarginClassList: Record<number, string> = { 4: "icon-warn", 8: "icon-error" };
      const oldDecorations = currentModel
        .getAllDecorations()
        .filter(
          (i) =>
            i.options.glyphMarginClassName &&
            Object.values(glyphMarginClassList).includes(i.options.glyphMarginClassName as string)
        );
      if (oldDecorations.length) monacoEditor.removeDecorations(oldDecorations.map((i) => i.id));
      monacoEditor.createDecorationsCollection(
        makers.map(({ startLineNumber, endLineNumber, severity }) => ({
          range: new Range(startLineNumber, 1, endLineNumber, 1),
          options: {
            isWholeLine: true, // @ts-ignore
            glyphMarginClassName: glyphMarginClassList[severity],
          },
        }))
      );
    };

    const handler = (message: any) => {
      if (!alive) return;
      const currentModel = getModel();
      if (!currentModel || (currentModel as any).isDisposed?.()) return;
      editor.setModelMarkers(currentModel, "ESLint", message.markers);
      const fix = new Map();
      message.markers.forEach((val: any) => {
        if (val.fix)
          fix.set(
            `${val.code?.value}|${val.startLineNumber}|${val.endLineNumber}|${val.startColumn}|${val.endColumn}`,
            val.fix
          );
      });
      globalCache.set("eslint-fix", fix);
      const formatMarkers = message.markers.map(({ startLineNumber, endLineNumber, severity }: any) => ({
        startLineNumber,
        endLineNumber,
        severity,
      }));
      diffEslint(formatMarkers);
    };

    LinterWorker.hook.addListener("message", handler);
    return () => {
      alive = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      LinterWorker.hook.removeListener("message", handler);
      disposables.forEach((d) => d.dispose());
    };
  }, [id, monacoEditor, enableEslint, eslintConfig]);

  return <div id={id} className={className} ref={div} />;
};

export default React.forwardRef(CodeEditor);
