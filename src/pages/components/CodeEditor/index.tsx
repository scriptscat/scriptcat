import { editor, Range } from "monaco-editor";
import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { globalCache, systemConfig } from "@App/pages/store/global";
import { LinterWorker } from "@App/pkg/utils/monaco-editor";

type Props = {
  className?: string;
  diffCode?: string; // 因为代码加载是异步的,diifCode有3种状态:undefined不确定,""没有diff,有diff,不确定的情况下,编辑器不会加载
  editable?: boolean;
  id: string;
  code?: string;
};

const CodeEditor: React.ForwardRefRenderFunction<{ editor: editor.IStandaloneCodeEditor | undefined }, Props> = (
  { id, className, code, diffCode, editable },
  ref
) => {
  const [monacoEditor, setEditor] = useState<editor.IStandaloneCodeEditor>();
  const [enableEslint, setEnableEslint] = useState(false);
  const [eslintConfig, setEslintConfig] = useState("");

  const div = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    editor: monacoEditor,
  }));

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

  useEffect(() => {
    if (diffCode === undefined || code === undefined || !div.current) {
      return () => {};
    }

    let edit: editor.IStandaloneDiffEditor | editor.IStandaloneCodeEditor | null = null;
    let originalModel: editor.ITextModel | null = null;
    let modifiedModel: editor.ITextModel | null = null;

    const inlineDiv = document.getElementById(id) as HTMLDivElement;

    // @ts-ignore
    if (diffCode) {
      edit = editor.createDiffEditor(inlineDiv, {
        hideUnchangedRegions: { enabled: true },
        enableSplitViewResizing: false,
        renderSideBySide: false,
        folding: true,
        foldingStrategy: "indentation",
        automaticLayout: true,
        overviewRulerBorder: false,
        scrollBeyondLastLine: false,
        readOnly: true,
        diffWordWrap: "off",
        glyphMargin: true,
        unicodeHighlight: { ambiguousCharacters: false },
      });

      // 保存 model 引用，之後在 cleanup 手動 dispose
      originalModel = editor.createModel(diffCode, "javascript");
      modifiedModel = editor.createModel(code, "javascript");
      (edit as editor.IStandaloneDiffEditor).setModel({
        original: originalModel,
        modified: modifiedModel,
      });
    } else {
      const codeEditor = editor.create(inlineDiv, {
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
      codeEditor.setValue(code);
      setEditor(codeEditor);
      edit = codeEditor;
    }
    return () => {
      // 目前会出现：Uncaught (in promise) Canceled: Canceled
      // 问题追踪：https://github.com/microsoft/monaco-editor/issues/4702
      try {
        edit?.dispose();
      } finally {
        // 確保 diff 的兩個 model 也被釋放（避免殘留）
        originalModel?.dispose();
        modifiedModel?.dispose();
        // 讓下游 effect 不再拿到已被 dispose 的 editor
        setEditor(undefined);
      }
    };
  }, [div, code, diffCode, editable, id]);

  useEffect(() => {
    if (!enableEslint) {
      return () => {};
    }
    if (!monacoEditor) {
      return () => {};
    }

    const model = monacoEditor.getModel();
    if (!model) {
      return () => {};
    }

    // --- 生命週期守門與清理 ---
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const disposables: Array<{ dispose: () => void }> = [];

    // editor 被 dispose 時，立即標記死亡並清理
    const editorDisposeListener = monacoEditor.onDidDispose(() => {
      alive = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    });
    disposables.push({ dispose: () => editorDisposeListener.dispose() });

    // --- debounce lint ---
    const lint = () => {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!alive) return;

        // model 可能在這段時間被 dispose，必須檢查
        const currentModel = monacoEditor.getModel();
        if (!currentModel || (currentModel as any).isDisposed?.()) return;

        let parsed: any = {};
        try {
          parsed = JSON.parse(eslintConfig || "{}");
        } catch {
          parsed = {};
        }

        LinterWorker.sendLinterMessage({
          code: currentModel.getValue(),
          id,
          config: parsed,
        });
      }, 500);
    };

    // 加载完成就检测一次
    lint();

    const contentDisposable = model.onDidChangeContent(() => {
      lint();
    });
    disposables.push({ dispose: () => contentDisposable.dispose() });

    // 在行号旁显示ESLint错误/警告图标
    const diffEslint = (
      makers: {
        startLineNumber: number;
        endLineNumber: number;
        severity: number;
      }[]
    ) => {
      if (!alive) return;

      // 再次確認 model 還活著
      const currentModel = monacoEditor.getModel();
      if (!currentModel || (currentModel as any).isDisposed?.()) return;

      // 定义glyph class
      const glyphMarginClassList: Record<number, string> = {
        4: "icon-warn",
        8: "icon-error",
      };

      // 先移除所有旧的Decorations
      const oldDecorations = currentModel
        .getAllDecorations()
        .filter(
          (i) =>
            i.options.glyphMarginClassName &&
            Object.values(glyphMarginClassList).includes(i.options.glyphMarginClassName as string)
        );
      if (oldDecorations.length) {
        monacoEditor.removeDecorations(oldDecorations.map((i) => i.id));
      }

      // 再重新添加新的Decorations
      monacoEditor.createDecorationsCollection(
        makers.map(({ startLineNumber, endLineNumber, severity }) => ({
          range: new Range(startLineNumber, 1, endLineNumber, 1),
          options: {
            isWholeLine: true,
            // @ts-ignore
            glyphMarginClassName: glyphMarginClassList[severity],
          },
        }))
      );
    };

    const handler = (message: any) => {
      if (!alive) return;
      if (id !== message.id) return;

      const currentModel = monacoEditor.getModel();
      if (!currentModel || (currentModel as any).isDisposed?.()) return;

      editor.setModelMarkers(currentModel, "ESLint", message.markers);

      const fix = new Map();
      // 设置fix
      message.markers.forEach(
        (val: {
          code: { value: any };
          startLineNumber: any;
          endLineNumber: any;
          startColumn: any;
          endColumn: any;
          fix: any;
        }) => {
          if (val.fix) {
            fix.set(
              `${val.code.value}|${val.startLineNumber}|${val.endLineNumber}|${val.startColumn}|${val.endColumn}`,
              val.fix
            );
          }
        }
      );
      globalCache.set("eslint-fix", fix);

      // 在行号旁显示ESLint错误/警告图标
      const formatMarkers = message.markers.map(
        ({
          startLineNumber,
          endLineNumber,
          severity,
        }: {
          startLineNumber: number;
          endLineNumber: number;
          severity: number;
        }) => ({ startLineNumber, endLineNumber, severity })
      );
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
