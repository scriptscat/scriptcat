import { systemConfig } from "@App/pages/store/global";
import EventEmitter from "eventemitter3";
import { editor, languages, MarkerSeverity } from "monaco-editor";
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
  lang = `${lang || ""}` as EditorLangCode | "";
  const key = ((Object.hasOwn(editorLangs, lang) && lang) || "en-US") as EditorLangCode;
  multiLang = asEditorLangEntry(key);
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

const scriptcatMarkerOwner = "ScriptCat";

const isSimpleValidHost = (hostName: string) => {
  let ret = false;
  try {
    ret = hostName.length > 0 && new URL(`https://${hostName}.com/path`).origin === `https://${hostName}.com`;
  } catch {
    // ignored
  }
  return ret;
};

const getMetadataLineFixes = (line: string) => {
  const match = /^(\s*\/\/[ \t]*@)(connect|match)([ \t]+)(\S+)(.*)$/i.exec(line);
  if (!match) return [];

  const [, prefix, tag, spacing, value, suffix] = match;
  if (tag === "connect" && value.length > 2 && value.startsWith("*.")) {
    const hostName = value.slice(2);
    if (/\.\w{2,}$/.test(hostName) && isSimpleValidHost(hostName)) {
      return [
        {
          title: multiLang.replaceConnectWildcard.replace("{0}", hostName),
          text: `${prefix}${tag}${spacing}${hostName}${suffix}`,
        },
      ];
    }
  }

  if (tag === "match") {
    const matchPattern = /^(\*|[-a-z]+|http\*):\/\/([^/]+)(\/.*)?$/i.exec(value);
    const host = matchPattern?.[2];
    if (host && host.endsWith(".*")) {
      const hostName = host.slice(0, -2);
      if (isSimpleValidHost(hostName)) {
        const lenDiff = "include".length - tag.length;
        let s = spacing;
        if (lenDiff > 0 && s.length > lenDiff) s = s.slice(0, -lenDiff);
        const tldValue = `${matchPattern[1]}://${hostName}.tld${matchPattern[3] || ""}`;
        return [
          {
            title: multiLang.replaceMatchWildcard.replace("{0}", value),
            text: `${prefix}include${s}${value}${suffix}`,
          },
          {
            title: multiLang.replaceMatchWildcard.replace("{0}", tldValue),
            text: `${prefix}include${s}${tldValue}${suffix}`,
          },
        ];
      }
    }
  }

  return [];
};

const updateScriptcatMetadataMarkers = (model: editor.ITextModel) => {
  if (model.getLanguageId() !== "javascript") return;

  const markers: editor.IMarkerData[] = [];
  const lineCount = model.getLineCount();
  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    const line = model.getLineContent(lineNumber);
    const metadataLineFixes = getMetadataLineFixes(line);
    if (metadataLineFixes.length === 0) continue;

    markers.push({
      severity: MarkerSeverity.Warning,
      message: metadataLineFixes[0].title,
      source: scriptcatMarkerOwner,
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: line.length + 1,
    });
  }

  editor.setModelMarkers(model, scriptcatMarkerOwner, markers);
};

const registerScriptcatMetadataMarkerProvider = () => {
  const registerModel = (model: editor.ITextModel) => {
    updateScriptcatMetadataMarkers(model);
    model.onDidChangeContent(() => {
      updateScriptcatMetadataMarkers(model);
    });
  };

  editor.getModels().forEach(registerModel);
  editor.onDidCreateModel(registerModel);
};

/**
 * 注册 monaco-editor 的全局环境与语言支援
 * 应该在应用启动早期执行一次（例如在 App 根组件 mount 时）
 */
export function registerEditor() {
  // 避免重复注册
  if (isRegisterEditorDone) return;
  isRegisterEditorDone = true;

  // worker 初始化：复用已有 worker 或创建新的
  if ((window.MonacoEnvironment as any)?.myLinterWorker) {
    linterWorkerDeferred.resolve((window.MonacoEnvironment as any)?.myLinterWorker);
  } else {
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

    Object.assign(window.MonacoEnvironment, {
      myLinterWorker: linterWorker,
      eslintFixMap: new Map(),
    });

    linterWorkerDeferred.resolve(linterWorker);
  }

  // provider 注册始终执行，不受 worker 复用影响
  const META_LINE = /\/\/[ \t]*@(\S+)[ \t]*(.*)$/;

  registerScriptcatMetadataMarkerProvider();

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

  languages.registerCodeActionProvider(
    "javascript",
    {
      provideCodeActions: (model /** ITextModel */, range /** Range */, context /** CodeActionContext */) => {
        const actions: languages.CodeAction[] = [];
        const eslintFixMap = <Map<string, any>>(window.MonacoEnvironment as any)?.eslintFixMap;
        const metadataLineFixes = getMetadataLineFixes(model.getLineContent(range.startLineNumber));
        const scriptcatDiagnostics = context.markers.filter(
          (marker) => marker.source === scriptcatMarkerOwner && marker.startLineNumber === range.startLineNumber
        );

        if (metadataLineFixes.length > 0) {
          const line = model.getLineContent(range.startLineNumber);
          metadataLineFixes.forEach((metadataLineFix, index) =>
            actions.push({
              title: metadataLineFix.title,
              diagnostics: scriptcatDiagnostics,
              kind: "quickfix",
              edit: {
                edits: [
                  {
                    resource: model.uri,
                    textEdit: {
                      range: {
                        startLineNumber: range.startLineNumber,
                        startColumn: 1,
                        endLineNumber: range.startLineNumber,
                        endColumn: line.length + 1,
                      },
                      text: metadataLineFix.text,
                    },
                    versionId: undefined,
                  },
                ],
              },
              isPreferred: index === 0,
            } satisfies languages.CodeAction)
          );
        }

        for (let i = 0; i < context.markers.length; i++) {
          // 判断有没有修复方案
          const val = context.markers[i];
          if (!val.code) continue;
          const code = typeof val.code === "string" ? val.code : val.code!.value;

          // 1. eslint-fix
          const baseKey = `${code}|${val.startLineNumber}|${val.endLineNumber}|${val.startColumn}|${val.endColumn}`;
          const fix = eslintFixMap?.get(baseKey);
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
                title: multiLang.declareGlobal.replace("{0}", globalName),
                diagnostics: [val],
                kind: "quickfix",
                edit: {
                  edits: [{ resource: model.uri, textEdit, versionId: undefined }],
                },
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
                    range: {
                      startLineNumber: 1,
                      startColumn: 1,
                      endLineNumber: 1,
                      endColumn: 1,
                    },
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
    },
    { providedCodeActionKinds: ["quickfix"] }
  );

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
