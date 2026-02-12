import { editor, Range } from "monaco-editor";
import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { systemConfig } from "@App/pages/store/global";
import { LinterWorkerController, registerEditor } from "@App/pkg/utils/monaco-editor";
import { fnPlaceHolder } from "@App/pages/store/AppContext";

fnPlaceHolder.setEditorTheme = (theme: string) => editor.setTheme(theme);

type Props = {
  className?: string;
  diffCode?: string; // 因为代码加载是异步的,diifCode有3种状态:undefined不确定,""没有diff,有diff,不确定的情况下,编辑器不会加载
  editable?: boolean;
  id: string;
  code?: string;
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

const CodeEditor = React.forwardRef<{ editor: editor.IStandaloneCodeEditor | undefined }, Props>(
  ({ id, className, code, diffCode, editable }, ref) => {
    const [monacoEditor, setEditor] = useState<editor.IStandaloneCodeEditor>();
    const [enableEslint, setEnableEslint] = useState(false);
    const [eslintConfig, setEslintConfig] = useState("");

    const divRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => ({ editor: monacoEditor }));

    // 註冊 monaco 全局環境（只需執行一次）
    useEffect(() => {
      registerEditor();
    }, []);

    // 載入 ESLint 設定
    useEffect(() => {
      Promise.all([systemConfig.getEslintConfig(), systemConfig.getEnableEslint()]).then(([config, enabled]) => {
        setEslintConfig(config);
        setEnableEslint(enabled);
      });
    }, []);

    // 建立 monaco 編輯器實例
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

        // https://code.visualstudio.com/docs/editing/intellisense

        // Controls whether suggestions should be accepted on commit characters. For example, in JavaScript, the semi-colon (`;`) can be a commit character that accepts a suggestion and types that character.
        acceptSuggestionOnCommitCharacter: true,

        // Controls if suggestions should be accepted on 'Enter' - in addition to 'Tab'. Helps to avoid ambiguity between inserting new lines or accepting suggestions. The value 'smart' means only accept a suggestion with Enter when it makes a textual change
        acceptSuggestionOnEnter: "on",

        // Controls the delay in ms after which quick suggestions will show up.
        quickSuggestionsDelay: 10,

        // Controls if suggestions should automatically show up when typing trigger characters
        suggestOnTriggerCharacters: true,

        // Controls if pressing tab inserts the best suggestion and if tab cycles through other suggestions
        tabCompletion: "off",

        // Controls whether sorting favours words that appear close to the cursor
        suggest: {
          localityBonus: true,
          preview: true,
        },

        // Controls how suggestions are pre-selected when showing the suggest list
        suggestSelection: "first",

        // Enable word based suggestions
        wordBasedSuggestions: "matchingDocuments",

        // Enable parameter hints
        parameterHints: {
          enabled: true,
        },

        // https://qiita.com/H-goto16/items/43802950fc5c112c316b
        // https://zenn.dev/udonj/articles/ultimate-vscode-customization-2024
        // https://github.com/is0383kk/VSCode

        quickSuggestions: {
          other: "inline",
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
        accessibilitySupport: "off",
        largeFileOptimizations: true,
        colorDecorators: true,
      } as const;

      if (diffCode) {
        edit = editor.createDiffEditor(container, {
          hideUnchangedRegions: { enabled: true },
          enableSplitViewResizing: false,
          renderSideBySide: false,
          readOnly: true,
          diffWordWrap: "off",
          ...commonEditorOptions,
        });
        edit.setModel({
          original: editor.createModel(diffCode, "javascript"),
          modified: editor.createModel(code, "javascript"),
        });
      } else {
        edit = editor.create(container, {
          language: "javascript",
          theme: document.body.getAttribute("arco-theme") === "dark" ? "vs-dark" : "vs",
          readOnly: !editable,
          ...commonEditorOptions,
        });
        edit.setValue(code);
        setEditor(edit);
      }

      return () => {
        // 目前会出现：Uncaught (in promise) Canceled: Canceled
        // 问题追踪：https://github.com/microsoft/monaco-editor/issues/4702
        edit?.dispose();
      };
    }, [id, code, diffCode, editable]);

    // ESLint 即時檢查邏輯
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
      // 加载完成就检测一次
      lint(); // 初次載入即檢查
      const changeListener = model.onDidChangeContent(lint);

      // 在 glyph margin (行号旁) 顯示EsLint錯誤/警告圖示
      const showGlyphIcons = (markers: { startLineNumber: number; endLineNumber: number; severity: number }[]) => {
        const glyphMarginClassList = { 4: "icon-warn", 8: "icon-error" };

        // 清除舊裝飾
        const oldDecorations = model
          .getAllDecorations()
          .filter(
            (d) =>
              d.options.glyphMarginClassName &&
              Object.values(glyphMarginClassList).includes(d.options.glyphMarginClassName!)
          );
        monacoEditor.removeDecorations(oldDecorations.map((d) => d.id));

        // (重新)添加新裝飾 - Decorations
        monacoEditor.createDecorationsCollection(
          markers.map(({ startLineNumber, endLineNumber, severity }) => ({
            range: new Range(startLineNumber, 1, endLineNumber, 1),
            options: {
              isWholeLine: true,
              glyphMarginClassName: glyphMarginClassList[severity as 4 | 8],
              /* 待改进 目前monaco似乎无法满足需求
              glyphMarginHoverMessage: allMarkers.reduce(
                (prev: any, next: any) => {
                  if (
                    next.startLineNumber === startLineNumber &&
                    next.endLineNumber === endLineNumber
                  ) {
                    prev.push({
                      value: `${next.message} ESLinter [(${next.code.value})](${next.code.target})`,
                      isTrusted: true,
                    });
                  }
                  return prev;
                },
                []
              ),
              */
            },
          }))
        );
      };

      const messageHandler = (message: any) => {
        if (id !== message.id) return;

        editor.setModelMarkers(model, "ESLint", message.markers);

        // 更新 eslint-fix 快取
        const eslintFixMap = (window.MonacoEnvironment as any)?.eslintFixMap;
        if (eslintFixMap) {
          message.markers.forEach((m: TMarker) => {
            if (m.fix) {
              const key = `${m.code.value}|${m.startLineNumber}|${m.endLineNumber}|${m.startColumn}|${m.endColumn}`;
              eslintFixMap.set(key, m.fix);
            }
          });
        }

        // 顯示 glyph 圖示 (在行号旁显示ESLint错误/警告图标)
        const formatted = message.markers.map((m: TFormattedMarker) => ({
          startLineNumber: m.startLineNumber,
          endLineNumber: m.endLineNumber,
          severity: m.severity,
        }));
        showGlyphIcons(formatted);
      };

      LinterWorkerController.hookAddListener("message", messageHandler);

      return () => {
        changeListener.dispose();
        LinterWorkerController.hookRemoveListener("message", messageHandler);
      };
    }, [monacoEditor, enableEslint, eslintConfig, id]);

    return <div id={id} className={className} ref={divRef} />;
  }
);

CodeEditor.displayName = "CodeEditor";

export default CodeEditor;
