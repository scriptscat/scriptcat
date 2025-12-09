import { editor, Range } from "monaco-editor";
import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { globalCache, systemConfig } from "@App/pages/store/global";
import { LinterWorker } from "@App/pkg/utils/monaco-editor";
import { fnPlaceHolder } from "@App/pages/store/AppContext";

fnPlaceHolder.setEditorTheme = (theme: string) => editor.setTheme(theme);

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
    let edit: editor.IStandaloneDiffEditor | editor.IStandaloneCodeEditor;
    const inlineDiv = document.getElementById(id) as HTMLDivElement;
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
      edit = editor.createDiffEditor(inlineDiv, {
        hideUnchangedRegions: {
          enabled: true,
        },
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
      edit = editor.create(inlineDiv, {
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
    let timer: NodeJS.Timeout | null;
    const lint = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        LinterWorker.sendLinterMessage({
          code: model.getValue(),
          id,
          config: JSON.parse(eslintConfig),
        });
      }, 500);
    };
    // 加载完成就检测一次
    lint();
    model.onDidChangeContent(() => {
      lint();
    });

    // 在行号旁显示ESLint错误/警告图标
    const diffEslint = (
      makers: {
        startLineNumber: number;
        endLineNumber: number;
        severity: number;
      }[]
    ) => {
      // 定义glyph class
      const glyphMarginClassList = {
        4: "icon-warn",
        8: "icon-error",
      };

      // 先移除所有旧的Decorations
      const oldDecorations = model
        .getAllDecorations()
        .filter(
          (i) =>
            i.options.glyphMarginClassName &&
            Object.values(glyphMarginClassList).includes(i.options.glyphMarginClassName)
        );
      monacoEditor.removeDecorations(oldDecorations.map((i) => i.id));

      /* 待改进 目前似乎monaco无法满足需求
      // 获取所有ESLint ModelMarkers
      const allMarkers = editor.getModelMarkers({ owner: "ESLint" });
      */

      // 再重新添加新的Decorations
      monacoEditor.createDecorationsCollection(
        makers.map(({ startLineNumber, endLineNumber, severity }) => ({
          range: new Range(startLineNumber, 1, endLineNumber, 1),
          options: {
            isWholeLine: true,
            // @ts-ignore
            glyphMarginClassName: glyphMarginClassList[severity],

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

    const handler = (message: any) => {
      if (id !== message.id) {
        return;
      }
      editor.setModelMarkers(model, "ESLint", message.markers);
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
      LinterWorker.hook.removeListener("message", handler);
    };
  }, [id, monacoEditor, enableEslint, eslintConfig]);

  return <div id={id} className={className} ref={div} />;
};

export default React.forwardRef(CodeEditor);
