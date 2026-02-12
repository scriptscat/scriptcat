import { systemConfig } from "@App/pages/store/global";
import EventEmitter from "eventemitter3";
import { languages } from "monaco-editor";
import { findGlobalInsertionInfo, updateGlobalCommentLine } from "./utils";
import type { EditorLangCode, EditorPrompt } from "./langs";
import { asEditorLangEntry, editorLangs } from "./langs";
import { deferred } from "../utils";

interface ILinterWorker extends Worker {
  myLinterHook: EventEmitter<string, any>;
}

// 注册 eslint worker（全局单例）
const linterWorkerDeferred = deferred<ILinterWorker>();
const langPromise = systemConfig.getLanguage();

let multiLang = asEditorLangEntry("en-US");

const updateLang = (lang: string) => {
  lang = (lang || "") as EditorLangCode | "";
  const key = (lang && (lang in editorLangs ? lang : "en-US")) || ("en-US" as EditorLangCode);
  multiLang = asEditorLangEntry(key as EditorLangCode);
};

langPromise.then((res) => updateLang(res));

systemConfig.addListener("language", (lang) => {
  updateLang(lang);
});

export class LinterWorkerController {
  static sendLinterMessage(data: unknown) {
    linterWorkerDeferred.promise.then((linterWorker) => {
      linterWorker.postMessage(data);
    });
  }
  static hookAddListener(event: string, fn: (...args: any[]) => void) {
    linterWorkerDeferred.promise.then((linterWorker) => {
      linterWorker.myLinterHook.addListener(event, fn);
    });
  }
  static hookRemoveListener(event: string, fn: (...args: any[]) => void) {
    linterWorkerDeferred.promise.then((linterWorker) => {
      linterWorker.myLinterHook.removeListener(event, fn);
    });
  }
  static hookEmit(event: string, data: any) {
    linterWorkerDeferred.promise.then((linterWorker) => {
      linterWorker.myLinterHook.emit(event, data);
    });
  }
}

let isRegisterEditorDone = false;

/**
 * 注册 monaco-editor 的全局环境与语言支援
 * 应该在应用启动早期执行一次（例如在 App 根组件 mount 时）
 */
export function registerEditor() {
  // 避免单一ServiceWorker重复执行
  if (isRegisterEditorDone) return;
  isRegisterEditorDone = true;

  // 单一Monaco环境（页面）只有一个 linterWorker
  // SW 重启后仍使用原有的 linterWorker 和 MonacoEnvironment
  if ((window.MonacoEnvironment as any)?.myLinterWorker) {
    linterWorkerDeferred.resolve((window.MonacoEnvironment as any)?.myLinterWorker);
    return;
  }

  const linterWorker = new Worker("/src/linter.worker.js") as ILinterWorker;
  linterWorker.myLinterHook = new EventEmitter<string, any>();

  linterWorker.onmessage = (event) => {
    LinterWorkerController.hookEmit("message", event.data);
  };

  window.MonacoEnvironment = {
    getWorkerUrl(moduleId: any, label: any) {
      if (label === "typescript" || label === "javascript") {
        return "/src/ts.worker.js";
      }
      return "/src/editor.worker.js";
    },
  };

  // 单一Monaco环境（页面）只有一个 linterWorker
  // SW 重启后仍使用原有的 linterWorker 和 MonacoEnvironment
  Object.assign(window.MonacoEnvironment, {
    myLinterWorker: linterWorker,
    eslintFixMap: new Map(),
  });

  linterWorkerDeferred.resolve(linterWorker);

  const META_LINE = /\/\/[ \t]*@(\S+)[ \t]*(.*)$/;

  languages.registerHoverProvider("javascript", {
    provideHover: (model, position) => {
      return new Promise((resolve) => {
        const line = model.getLineContent(position.lineNumber);
        const m = META_LINE.exec(line);
        if (m) {
          const key = m[1] as keyof EditorPrompt;
          const prompt = multiLang.prompt;
          resolve({
            contents: [
              {
                value: prompt[key] || multiLang.undefinedPrompt,
                supportHtml: true,
              },
            ],
          });
        } else if (/==UserScript==/.test(line)) {
          resolve({
            contents: [{ value: multiLang.thisIsAUserScript }],
          });
        } else {
          resolve(null);
        }
      });
    },
  });

  languages.registerCodeActionProvider("javascript", {
    provideCodeActions: (model /** ITextModel */, range /** Range */, context /** CodeActionContext */) => {
      const actions: languages.CodeAction[] = [];
      const eslintFixMap = <Map<string, any>>(window.MonacoEnvironment as any)?.eslintFixMap;

      for (let i = 0; i < context.markers.length; i++) {
        // 判断有没有修复方案
        const val = context.markers[i];
        const code = typeof val.code === "string" ? val.code : val.code!.value;

        // 1. eslint-fix
        // 为避免多个 model / 编辑器实例间的 key 冲突，优先使用包含 model.uri 的作用域 key；
        // 为保持向后兼容，若找不到则回退到旧的无作用域 key。
        const baseKey = `${code}|${val.startLineNumber}|${val.endLineNumber}|${val.startColumn}|${val.endColumn}`;
        const modelKey = model.uri.toString();
        const scopedKey = `${modelKey}|${baseKey}`;
        const fix = eslintFixMap?.get(scopedKey) ?? eslintFixMap?.get(baseKey);
        if (fix) {
          actions.push({
            title: multiLang.quickfix.replace("{0}", code),
            diagnostics: [val],
            kind: "quickfix",
            edit: {
              edits: [
                {
                  resource: model.uri,
                  textEdit: {
                    range: fix.range,
                    text: fix.text,
                  },
                  versionId: undefined,
                },
              ],
            },
            isPreferred: true,
          } satisfies languages.CodeAction);
        }

        // 2. no-undef → /* global */
        if (code === "no-undef") {
          const message = val.message || "";
          const match = message.match(/^[^']*'([^']+)'[^']*$/);
          const globalName = match?.[1];

          if (globalName) {
            const { insertLine, globalLine } = findGlobalInsertionInfo(model);
            let textEdit: languages.IWorkspaceTextEdit["textEdit"];

            if (globalLine != null) {
              // there is already a /* global ... */ line → update it
              const oldLine = model.getLineContent(globalLine);
              const newLine = updateGlobalCommentLine(oldLine, globalName);
              textEdit = {
                range: {
                  startLineNumber: globalLine,
                  startColumn: 1,
                  endLineNumber: globalLine,
                  endColumn: oldLine.length + 1,
                },
                text: newLine,
              };
            } else {
              // no global line yet → insert a new one
              textEdit = {
                range: {
                  startLineNumber: insertLine,
                  startColumn: 1,
                  endLineNumber: insertLine,
                  endColumn: 1,
                },
                text: `/* global ${globalName} */\n`,
              };
            }

            actions.push({
              title: `将 '${globalName}' 声明为全局变量 (/* global */)`,
              diagnostics: [val],
              kind: "quickfix",
              edit: { edits: [{ resource: model.uri, textEdit, versionId: undefined }] },
              isPreferred: false,
            } satisfies languages.CodeAction);
          }
        }

        // 3. disable-next-line / disable
        actions.push({
          title: multiLang.addEslintDisableNextLine,
          diagnostics: [val],
          kind: "quickfix",
          edit: {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: val.startLineNumber,
                    endLineNumber: val.startLineNumber,
                    startColumn: 1,
                    endColumn: 1,
                  },
                  text: `// eslint-disable-next-line ${code}\n`,
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: true,
        } satisfies languages.CodeAction);

        actions.push({
          title: multiLang.addEslintDisable,
          diagnostics: [val],
          kind: "quickfix",
          edit: {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
                  text: `/* eslint-disable ${code} */\n`,
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: true,
        } satisfies languages.CodeAction);
      }

      // const actions = context.markers.map((error) => {
      //   const edit: languages.IWorkspaceTextEdit = {
      //     resource: model.uri,
      //     textEdit: {
      //       range,
      //       text: "console.log(1)",
      //     },
      //     versionId: undefined,
      //   };
      //   return <languages.CodeAction>{
      //     title: ``,
      //     diagnostics: [error],
      //     kind: "quickfix",
      //     edit: {
      //       edits: [edit],
      //     },
      //     isPreferred: true,
      //   };
      // });

      return { actions, dispose: () => {} };
    },
  });

  // 设定编译器选项与额外类型定义
  Promise.all([systemConfig.getEditorConfig(), systemConfig.getEditorTypeDefinition()]).then(
    ([editorConfig, typeDefinition]) => {
      // 设置编辑器设置
      const options = JSON.parse(editorConfig) as languages.typescript.CompilerOptions;
      languages.typescript.javascriptDefaults.setCompilerOptions({
        allowNonTsExtensions: true,
        ...options,
      });
      // 注册类型定义
      languages.typescript.javascriptDefaults.addExtraLib(typeDefinition, "scriptcat.d.ts");
    }
  );
}
