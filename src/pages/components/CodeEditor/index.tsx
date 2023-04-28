import Cache from "@App/app/cache";
import IoC from "@App/app/ioc";
import { SystemConfig } from "@App/pkg/config/config";
import { LinterWorker } from "@App/pkg/utils/monaco-editor";
import { editor, Range } from "monaco-editor";
import React, { useEffect, useImperativeHandle, useState } from "react";

type Props = {
  // eslint-disable-next-line react/require-default-props
  className?: string;
  // eslint-disable-next-line react/require-default-props
  diffCode?: string; // 因为代码加载是异步的,diifCode有3种状态:undefined不确定,""没有diff,有diff,不确定的情况下,编辑器不会加载
  // eslint-disable-next-line react/require-default-props
  editable?: boolean;
  id: string;
  // eslint-disable-next-line react/require-default-props
  code?: string;
};

const CodeEditor: React.ForwardRefRenderFunction<
  { editor: editor.ICodeEditor | undefined },
  Props
> = ({ id, className, code, diffCode, editable }, ref) => {
  const [monacoEditor, setEditor] = useState<editor.ICodeEditor>();
  useImperativeHandle(ref, () => ({
    editor: monacoEditor,
  }));
  useEffect(() => {
    if (diffCode === undefined || code === undefined) {
      return () => {};
    }
    let edit: editor.IStandaloneDiffEditor | editor.IStandaloneCodeEditor;
    // @ts-ignore
    const ts = window.tsUrl ? 0 : 200;
    setTimeout(() => {
      const div = document.getElementById(id) as HTMLDivElement;
      if (diffCode) {
        edit = editor.createDiffEditor(div, {
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
        });
        edit.setModel({
          original: editor.createModel(diffCode, "javascript"),
          modified: editor.createModel(code, "javascript"),
        });
      } else {
        edit = editor.create(div, {
          language: "javascript",
          theme:
            document.body.getAttribute("arco-theme") === "dark"
              ? "vs-dark"
              : "vs",
          folding: true,
          foldingStrategy: "indentation",
          automaticLayout: true,
          overviewRulerBorder: false,
          scrollBeyondLastLine: false,
          readOnly: !editable,
          glyphMargin: true,
        });
        edit.setValue(code);

        setEditor(edit);
      }
    }, ts);
    return () => {
      if (edit) {
        edit.dispose();
      }
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
        LinterWorker.sendLinterMessage({
          code: model.getValue(),
          id,
          config: JSON.parse(config.eslintConfig),
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
            Object.values(glyphMarginClassList).includes(
              i.options.glyphMarginClassName
            )
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
      Cache.getInstance().set("eslint-fix", fix);

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
    />
  );
};

export default React.forwardRef(CodeEditor);
