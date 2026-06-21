import { editor, Range } from "monaco-editor";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { systemConfig } from "@App/pages/store/global";
import { LinterWorkerController, registerEditor } from "@App/pkg/utils/monaco-editor";
import { clearModelEslintFixes, getModelEslintFixKey } from "@App/pkg/utils/monaco-editor/eslintFixCache";
import { useTheme } from "@App/pages/components/theme-provider";
import { resolveMonacoTheme } from "./theme";

type Props = {
  ref?: Ref<{ editor: editor.IStandaloneCodeEditor | undefined }>;
  className?: string;
  diffCode?: string; // 代码加载是异步的：undefined=不确定(不加载)，""=无 diff，有值=diff
  editable?: boolean;
  id: string;
  code?: string;
  onChange?: (code: string) => void;
  onEditorMount?: (editor: editor.IStandaloneCodeEditor) => void;
};

type TMarker = {
  code: { value: any };
  startLineNumber: any;
  endLineNumber: any;
  startColumn: any;
  endColumn: any;
  fix: any;
} & Record<string, any>;

type TFormattedMarker = {
  startLineNumber: number;
  endLineNumber: number;
  severity: number;
} & Record<string, any>;

function CodeEditor({ id, className, code, diffCode, editable, onChange, onEditorMount, ref }: Props) {
  const [monacoEditor, setEditor] = useState<editor.IStandaloneCodeEditor>();
  // 普通 editor 与 diff editor 都会置位，供主题切换 effect 判断实例是否就绪
  // （monacoEditor 仅在普通 editor 时设置，diff 分支不设置，故不能用它来 gate 主题切换）
  const editorReadyRef = useRef(false);
  const [enableEslint, setEnableEslint] = useState(false);
  const [eslintConfig, setEslintConfig] = useState("");

  const { resolvedTheme } = useTheme();

  // 用 ref 保存最新回调，避免 stale closure 同时不让创建 effect 重跑
  const onChangeRef = useRef(onChange);
  const onEditorMountRef = useRef(onEditorMount);
  // ref 赋值须在创建 effect 之前，确保 mount 时创建 effect 同步读到最新 onEditorMount
  useEffect(() => {
    onChangeRef.current = onChange;
    onEditorMountRef.current = onEditorMount;
  });

  const divRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ editor: monacoEditor }));

  // 注册 monaco 全局环境（只需执行一次）
  useEffect(() => {
    registerEditor();
  }, []);

  // 载入 ESLint 设定
  useEffect(() => {
    void Promise.all([systemConfig.getEslintConfig(), systemConfig.getEnableEslint()]).then(([config, enabled]) => {
      setEslintConfig(config);
      setEnableEslint(enabled);
    });
  }, []);

  // 建立 monaco 编辑器实例
  useEffect(() => {
    if (diffCode === undefined || code === undefined || !divRef.current) return;

    const container = document.getElementById(id) as HTMLDivElement;
    let edit: editor.IStandaloneCodeEditor | editor.IStandaloneDiffEditor;

    const commonEditorOptions = {
      folding: true,
      foldingStrategy: "indentation",
      automaticLayout: true,
      scrollbar: { alwaysConsumeMouseWheel: false },
      overviewRulerBorder: false,
      scrollBeyondLastLine: false,

      glyphMargin: true,
      unicodeHighlight: {
        ambiguousCharacters: false,
      },

      acceptSuggestionOnCommitCharacter: true,
      acceptSuggestionOnEnter: "on",
      quickSuggestionsDelay: 10,
      suggestOnTriggerCharacters: true,
      tabCompletion: "off",
      suggest: {
        localityBonus: true,
        preview: true,
      },
      suggestSelection: "first",
      wordBasedSuggestions: "off",
      parameterHints: {
        enabled: true,
      },
      quickSuggestions: {
        other: true,
        comments: true,
        strings: true,
      },
      fastScrollSensitivity: 10,
      smoothScrolling: true,
      inlineSuggest: {
        enabled: true,
      },
      guides: {
        indentation: true,
      },
      renderLineHighlightOnlyWhenFocus: true,
      snippetSuggestions: "top",
      cursorBlinking: "phase",
      cursorSmoothCaretAnimation: "off",
      autoIndent: "advanced",
      wrappingIndent: "indent",
      wordSegmenterLocales: ["ja", "zh-CN", "zh-Hant-TW"] as string[],
      renderLineHighlight: "gutter",
      renderWhitespace: "selection",
      renderControlCharacters: true,
      dragAndDrop: false,
      emptySelectionClipboard: false,
      copyWithSyntaxHighlighting: false,
      bracketPairColorization: {
        enabled: true,
      },
      mouseWheelZoom: true,
      links: true,
      accessibilitySupport: "auto",
      largeFileOptimizations: true,
      colorDecorators: true,
    } as const;

    const initialTheme = resolveMonacoTheme(resolvedTheme);
    let originalModel: editor.ITextModel | undefined;
    let modifiedModel: editor.ITextModel | undefined;
    let changeListener: { dispose: () => void } | undefined;
    if (diffCode) {
      edit = editor.createDiffEditor(container, {
        hideUnchangedRegions: { enabled: true },
        enableSplitViewResizing: false,
        renderSideBySide: false,
        readOnly: true,
        diffWordWrap: "off",
        theme: initialTheme,
        ...commonEditorOptions,
      });
      // standalone model 不随 editor.dispose 自动清理，需手动跟踪并在 cleanup 释放
      originalModel = editor.createModel(diffCode, "javascript");
      modifiedModel = editor.createModel(code, "javascript");
      edit.setModel({
        original: originalModel,
        modified: modifiedModel,
      });
      editorReadyRef.current = true;
    } else {
      const standaloneEdit = editor.create(container, {
        language: "javascript",
        theme: initialTheme,
        readOnly: !editable,
        ...commonEditorOptions,
      });
      edit = standaloneEdit;
      standaloneEdit.setValue(code);
      const model = standaloneEdit.getModel();
      if (model) {
        changeListener = model.onDidChangeContent(() => {
          onChangeRef.current?.(standaloneEdit.getValue() || "");
        });
      }
      setEditor(standaloneEdit);
      editorReadyRef.current = true;
      onEditorMountRef.current?.(standaloneEdit);
    }

    return () => {
      // 目前会出现：Uncaught (in promise) Canceled: Canceled
      // 问题追踪：https://github.com/microsoft/monaco-editor/issues/4702
      changeListener?.dispose();
      edit?.dispose();
      originalModel?.dispose();
      modifiedModel?.dispose();
    };
    // resolvedTheme 仅作为初始主题，运行时变化由下方 effect 通过 setTheme 处理，不重建实例
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, code, diffCode, editable]);

  // 主题切换：monaco theme 为全局静态，切换时无需重建实例。
  // 用 editorReadyRef（普通 + diff 实例都会置位）判断就绪，确保 diff 预览也随主题更新。
  // 依赖含创建 effect 的入参：创建 effect 声明在前先执行并置位 ref，本 effect 随后即可应用主题。
  // editorReadyRef 为 ref 不入依赖；id/code/diffCode/editable 用于在重建实例后重新应用主题
  useEffect(() => {
    if (!editorReadyRef.current) return;
    editor.setTheme(resolveMonacoTheme(resolvedTheme));
  }, [resolvedTheme, id, code, diffCode, editable]);

  // ESLint 即时检查逻辑
  useEffect(() => {
    if (!enableEslint || !monacoEditor) return;

    const model = monacoEditor.getModel();
    if (!model) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const lint = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        LinterWorkerController.sendLinterMessage({
          code: model.getValue(),
          id,
          config: JSON.parse(eslintConfig),
        });
      }, 500);
    };
    lint(); // 初次载入即检查
    const changeListener = model.onDidChangeContent(lint);

    // 在 glyph margin (行号旁) 显示 ESLint 错误/警告图示
    const showGlyphIcons = (markers: { startLineNumber: number; endLineNumber: number; severity: number }[]) => {
      const glyphMarginClassList = { 4: "icon-warn", 8: "icon-error" };
      const oldDecorations = model
        .getAllDecorations()
        .filter(
          (d) =>
            d.options.glyphMarginClassName &&
            Object.values(glyphMarginClassList).includes(d.options.glyphMarginClassName!)
        );
      monacoEditor.removeDecorations(oldDecorations.map((d) => d.id));
      monacoEditor.createDecorationsCollection(
        markers.map(({ startLineNumber, endLineNumber, severity }) => ({
          range: new Range(startLineNumber, 1, endLineNumber, 1),
          options: {
            isWholeLine: true,
            glyphMarginClassName: glyphMarginClassList[severity as 4 | 8],
          },
        }))
      );
    };

    const messageHandler = (message: any) => {
      if (id !== message.id) return;
      editor.setModelMarkers(model, "ESLint", message.markers);

      const eslintFixMap = (window.MonacoEnvironment as any)?.eslintFixMap;
      if (eslintFixMap) {
        clearModelEslintFixes(eslintFixMap, model);
        message.markers.forEach((m: TMarker) => {
          if (m.fix) {
            const key = getModelEslintFixKey(model, m.code.value, m);
            eslintFixMap.set(key, m.fix);
          }
        });
      }

      const formatted = message.markers.map((m: TFormattedMarker) => ({
        startLineNumber: m.startLineNumber,
        endLineNumber: m.endLineNumber,
        severity: m.severity,
      }));
      showGlyphIcons(formatted);
    };

    LinterWorkerController.hookAddListener("message", messageHandler);

    return () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      changeListener.dispose();
      const eslintFixMap = (window.MonacoEnvironment as any)?.eslintFixMap;
      if (eslintFixMap) {
        clearModelEslintFixes(eslintFixMap, model);
      }
      LinterWorkerController.hookRemoveListener("message", messageHandler);
    };
  }, [monacoEditor, enableEslint, eslintConfig, id]);

  return <div id={id} className={className} ref={divRef} />;
}

CodeEditor.displayName = "CodeEditor";

export default CodeEditor;
