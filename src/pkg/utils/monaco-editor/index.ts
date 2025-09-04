import { globalCache, systemConfig } from "@App/pages/store/global";
import EventEmitter from "eventemitter3";
import { languages } from "monaco-editor";

// 注册eslint
const linterWorker = new Worker("/src/linter.worker.js");

export default function registerEditor() {
  window.MonacoEnvironment = {
    getWorkerUrl(moduleId: any, label: any) {
      if (label === "typescript" || label === "javascript") {
        return "/src/ts.worker.js";
      }
      return "/src/editor.worker.js";
    },
  };

  // 悬停提示
  const prompt: { [key: string]: any } = {
    name: "脚本名称",
    description: "脚本描述",
    namespace: "脚本命名空间",
    version: "脚本版本",
    author: "脚本作者",
    background: "后台脚本",
    crontab: `定时脚本 crontab 参考（不适用于云端脚本）
    * * * * * * 每秒运行一次
    * * * * * 每分钟运行一次
    0 */6 * * * 每6小时的0分时执行一次
    15 */6 * * * 每6小时的15分时执行一次
    * once * * * 每小时运行一次
    * * once * * 每天运行一次
    * 10 once * * 每天10点-10:59中运行一次,假设当10:04时运行了一次,10:05-10:59的后续的时间将不会再运行
    * 1,3,5 once * * 每天1点3点5点中运行一次,假设当1点时运行了一次,3,5点将不会再运行
    * */4 once * * 每天每隔4小时检测运行一次,假设当4点时运行了一次,8,12,16,20,24点等后续的时间将不会再运行
    * 10-23 once * * 每天10点-23:59中运行一次,假设当10:04时运行了一次,10:05-23:59的后续时间将不会再运行
    * once 13 * * 每个月的13号的每小时运行一次`.replace(/\n/g, "<br>"),
  };

  languages.registerHoverProvider("javascript", {
    provideHover: (model, position) => {
      return new Promise((resolve) => {
        const line = model.getLineContent(position.lineNumber);
        const flag = /^\/\/\s*@(\w+?)(\s+(.*?)|)$/.exec(line);
        if (flag) {
          resolve({
            contents: [{ value: prompt[flag[1]], supportHtml: true }],
          });
        } else if (/==UserScript==/.test(line)) {
          // 匹配==UserScript==
          resolve({
            contents: [{ value: "一个用户脚本" }],
          });
        } else {
          resolve(null);
        }
      });
    },
  });

  // 处理quick fix
  languages.registerCodeActionProvider("javascript", {
    provideCodeActions: (model /** ITextModel */, range /** Range */, context /** CodeActionContext */) => {
      const actions: languages.CodeAction[] = [];
      const eslintFix = <Map<string, any>>globalCache.get("eslint-fix");
      for (let i = 0; i < context.markers.length; i += 1) {
        // 判断有没有修复方案
        const val = context.markers[i];
        const code = typeof val.code === "string" ? val.code : val.code!.value;
        const fix = eslintFix.get(
          `${code}|${val.startLineNumber}|${val.endLineNumber}|${val.startColumn}|${val.endColumn}`
        );
        if (fix) {
          const edit: languages.IWorkspaceTextEdit = {
            resource: model.uri,
            textEdit: {
              range: fix.range,
              text: fix.text,
            },
            versionId: undefined,
          };
          actions.push(<languages.CodeAction>{
            title: `修复 ${code} 问题`,
            diagnostics: [val],
            kind: "quickfix",
            edit: {
              edits: [edit],
            },
            isPreferred: true,
          });
        }
        // 添加eslint-disable-next-line和eslint-disable
        actions.push(<languages.CodeAction>{
          title: `添加 eslint-disable-next-line 注释`,
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
                  text: `// eslint-disable-next-line ${typeof val.code === "string" ? val.code : val.code!.value}\n`,
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: true,
        });
        actions.push(<languages.CodeAction>{
          title: `添加 eslint-disable 注释`,
          diagnostics: [val],
          kind: "quickfix",
          edit: {
            edits: [
              {
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: 1,
                    endLineNumber: 1,
                    startColumn: 1,
                    endColumn: 1,
                  },
                  text: `/* eslint-disable ${typeof val.code === "string" ? val.code : val.code!.value} */\n`,
                },
                versionId: undefined,
              },
            ],
          },
          isPreferred: true,
        });
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
      return {
        actions,
        dispose: () => {},
      };
    },
  });

  Promise.all([systemConfig.getEditorConfig(), systemConfig.getEditorTypeDefinition()]).then(
    ([editorConfig, typeDefinition]) => {
      // 设置编辑器设置
      languages.typescript.javascriptDefaults.setCompilerOptions(
        JSON.parse(editorConfig) as languages.typescript.CompilerOptions
      );
      // 注册类型定义
      languages.typescript.javascriptDefaults.addExtraLib(typeDefinition, "scriptcat.d.ts");
    }
  );
}

export class LinterWorker {
  static hook = new EventEmitter<string, any>();

  static sendLinterMessage(data: unknown) {
    linterWorker.postMessage(data);
  }
}

linterWorker.onmessage = (event) => {
  LinterWorker.hook.emit("message", event.data);
};
