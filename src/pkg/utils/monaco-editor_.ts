/* eslint-disable no-await-in-loop */
// @ts-ignore
// eslint-disable-next-line import/no-unresolved
import dts from "@App/types/scriptcat";
import Hook from "@App/app/service/hook";
import { languages } from "monaco-editor";
import Cache from "@App/app/cache";

// 注册eslint
const linterWorker = new Worker("/src/linter.worker.js");
const editorWorker = new Worker("/src/editor.worker.js", { type: "module" });

const getPartialBlob = (idx: number): Promise<Blob | null> => fetch(
  chrome.runtime.getURL(`/src/ts.worker.js.part${idx}`)
).then((resp) => (resp.ok ? resp.blob() : null))
  .catch(() => null);
const combineBlobsToUrl = async (blobs: Blob[], defaultType?: string): Promise<string> => {
  const arrayBuffers: ArrayBuffer[] = [];
  let totalLength = 0;

  // Read all blobs into ArrayBuffers and compute total length
  for (const blob of blobs) {
    const arrayBuffer = await blob.arrayBuffer();
    arrayBuffers.push(arrayBuffer);
    totalLength += arrayBuffer.byteLength; // <-- sum, don't overwrite
  }

  // Allocate a single Uint8Array large enough for everything
  const combined = new Uint8Array(totalLength);

  // Copy each buffer into the combined array
  let offset = 0;
  for (const buffer of arrayBuffers) {
    combined.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  // Create a single Blob out of the combined data
  const type = defaultType || blobs[0]?.type || "application/octet-stream";
  const combinedBlob = new Blob([combined], { type });

  // Create a Blob URL
  const blobUrl = URL.createObjectURL(combinedBlob);
  // 注意：此处生成的 Blob URL 在整个应用生命周期内用于 Worker，不会被释放。
  // 如果未来 Worker 支持销毁重建，请在销毁时调用 URL.revokeObjectURL(blobUrl) 释放资源。
  return blobUrl;
}


const tsWorkerPromise = fetch(chrome.runtime.getURL("/src/ts.worker.js.part0")).then((resp) => {
  return resp.ok ? resp.blob() : null;
}).catch(() => { return null }).then(async (blob) => {
  let worker: Worker;
  if (blob) {
    // 有分割
    const blobs: Blob[] = [];
    let idx = 0;
    do {
      blobs.push(blob);
      blob = await getPartialBlob(++idx);
    } while (blob);
    const url = await combineBlobsToUrl(blobs, "text/javascript");
    worker = new Worker(url, { type: "module" });
  } else {
    // 沒分割
    worker = new Worker("/src/ts.worker.js", { type: "module" });
  }
  return worker;
});

export default function registerEditor() {

  window.MonacoEnvironment = {
    // https://microsoft.github.io/monaco-editor/typedoc/interfaces/Environment.html#getWorker
    // Returns Worker | Promise<Worker>
    getWorker(workerId: string, label: string) {
      if (label === "typescript" || label === "javascript") {
        return tsWorkerPromise;
      }
      return editorWorker;
    },
  };

  languages.typescript.javascriptDefaults.addExtraLib(dts, "tampermonkey.d.ts");

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
    provideCodeActions: (
      model /** ITextModel */,
      range /** Range */,
      context /** CodeActionContext */
    ) => {
      const actions: languages.CodeAction[] = [];
      const eslintFix = <Map<string, any>>Cache.getInstance().get("eslint-fix");
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
}

export class LinterWorker {
  static hook = new Hook<"message">();

  static sendLinterMessage(data: any) {
    linterWorker.postMessage(data);
  }
}

linterWorker.onmessage = (event) => {
  LinterWorker.hook.trigger("message", event.data);
};
