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
    copyright: "脚本的版权信息",
    license: "脚本的开源协议",
    version: "脚本版本",
    description: "脚本描述",
    icon: "脚本图标",
    iconURL: "脚本图标",
    defaulticon: "脚本图标",
    icon64: "64x64 大小的脚本图标",
    icon64URL: "64x64 大小的脚本图标",
    grant: "脚本特殊Api权限申请",
    author: "脚本作者",
    "run-at":
      "脚本的运行时间<br>`document-start`：在前端匹配到网址后,以最快的速度注入脚本到页面中<br>`document-end`：DOM 加载完成后注入脚本,此时页面脚本和图像等资源可能仍在加载<br>`document-idle`：所有内容加载完成后注入脚本<br>`document-body`：脚本只会在页面中有 body 元素时才会注入",
    "run-in": "脚本注入的环境",
    homepage: "脚本主页",
    homepageURL: "脚本主页",
    website: "脚本主页",
    background: "后台脚本",
    include: "脚本匹配url运行的页面",
    match: "脚本匹配url运行的页面",
    exclude: "脚本匹配url不运行的页面",
    connect: "获取网站的访问权限",
    resource: "引入资源文件",
    require: "引入外部 js 文件",
    noframes: "表示脚本不运行在`<frame>`中",
    definition: "ScriptCat特有功能：一个`.d.ts`文件的引用地址,能够自动补全编辑器的自动提示",
    antifeature: "这是与脚本市场有关的，不受欢迎的功能需要加上此描述值",
    updateURL: "脚本检查更新的url",
    downloadURL: "脚本更新的下载地址",
    supportURL: "支持站点，bug 反馈页面",
    source: "脚本源码页",
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
        const flag = /^\/\/\s*@([\w-]+?)(\s+(.*?)|)$/.exec(line);
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

export class LinterWorker {
  static hook = new EventEmitter<string, any>();

  static sendLinterMessage(data: unknown) {
    linterWorker.postMessage(data);
  }
}

linterWorker.onmessage = (event) => {
  LinterWorker.hook.emit("message", event.data);
};
