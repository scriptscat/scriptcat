import IoC from "@App/app/ioc";
import { SystemConfig } from "@App/pkg/config/config";
import { LinterWorkerController, registerEditor } from "@App/pkg/utils/monaco-editor";
import { editor, Range } from "monaco-editor";
import React, { useEffect, useImperativeHandle, useRef, useState } from "react";

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

const CodeEditor: React.ForwardRefRenderFunction<
  { editor: editor.ICodeEditor | undefined },
  Props
> = ({ id, className, code, diffCode, editable }, ref) => {
  const [monacoEditor, setEditor] = useState<editor.ICodeEditor>();
  const divRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    editor: monacoEditor,
  }));

  // 注册 monaco 全局环境（只需执行一次）
  useEffect(() => {
    registerEditor();
  }, []);

  useEffect(() => {
    if (diffCode === undefined || code === undefined || !divRef.current) return;
    let edit: editor.IStandaloneDiffEditor | editor.IStandaloneCodeEditor;

    const inlineDiv = divRef.current;
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
      wordBasedSuggestions: "off",

      // Enable parameter hints
      parameterHints: {
        enabled: true,
      },

      // https://qiita.com/H-goto16/items/43802950fc5c112c316b
      // https://zenn.dev/udonj/articles/ultimate-vscode-customization-2024
      // https://github.com/is0383kk/VSCode

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
      accessibilitySupport: "off",
      largeFileOptimizations: true,
      colorDecorators: true,
    } as const;
    let originalModel: editor.ITextModel | undefined;
    let modifiedModel: editor.ITextModel | undefined;
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
      // standalone model 不会随 editor.dispose 自动清理，需手动跟踪并在 cleanup 释放
      originalModel = editor.createModel(diffCode, "javascript");
      modifiedModel = editor.createModel(code, "javascript");
      edit.setModel({
        original: originalModel,
        modified: modifiedModel,
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
      originalModel?.dispose();
      modifiedModel?.dispose();
    };
  }, [code, diffCode]);

  useEffect(() => {
    const config = IoC.instance(SystemConfig) as SystemConfig;
    if (!config.enableEslint) {
      return () => {};
    }
    if (!monacoEditor) {
      return () => {};
    }
    const model = monacoEditor.getModel();
    if (!model) {
      return () => {};
    }
    let timer: any;
    const lint = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        LinterWorkerController.sendLinterMessage({
          code: model.getValue(),
          id,
          config: JSON.parse(config.eslintConfig),
        });
      }, 500);
    };
    // 加载完成就检测一次
    lint();
    const changeListener = model.onDidChangeContent(lint);

    // 在行号旁显示ESLint错误/警告图标
    const showGlyphIcons = (
      makers: TFormattedMarker[]
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
          (d) =>
            d.options.glyphMarginClassName &&
            Object.values(glyphMarginClassList).includes(d.options.glyphMarginClassName!)
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

      // 更新 eslint-fix 快取（每次替换整个 map，避免已修复问题的过期条目残留）
      const eslintFixMap = (window.MonacoEnvironment as any)?.eslintFixMap;
      if (eslintFixMap) {
        eslintFixMap.clear();
        message.markers.forEach((m: TMarker) => {
          if (m.fix) {
            const key = `${m.code.value}|${m.startLineNumber}|${m.endLineNumber}|${m.startColumn}|${m.endColumn}`;
            eslintFixMap.set(key, m.fix);
          }
        });
      }

      // 显示 glyph 图示 (在行号旁显示ESLint错误/警告图标)
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
      LinterWorkerController.hookRemoveListener("message", messageHandler);
    };
  }, [monacoEditor]);

  return (
    <div
      id={id}
      style={{
        margin: 0,
        padding: 0,
        border: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
      className={className}
      ref={divRef}
    />
  );
};

export default React.forwardRef(CodeEditor);
