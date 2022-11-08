// @ts-ignore
// eslint-disable-next-line import/no-unresolved
import dts from "@App/types/scriptcat";
import Hook from "@App/app/service/hook";
import { languages } from "monaco-editor";
import pako from "pako";

// 注册eslint
const linterWorker = new Worker("/src/linter.worker.js");

export default function registerEditor() {
  // @ts-ignore
  window.tsUrl = "";
  fetch(chrome.runtime.getURL("/src/ts.worker.js.gz"))
    .then((resp) => resp.blob())
    .then(async (blob) => {
      const result = pako.inflate(await blob.arrayBuffer());
      // @ts-ignore
      window.tsUrl = URL.createObjectURL(new Blob([result]));
    });
  // @ts-ignore
  window.MonacoEnvironment = {
    getWorkerUrl(moduleId: any, label: any) {
      if (label === "typescript" || label === "javascript") {
        // return "/src/ts.worker.js";
        // @ts-ignore
        return window.tsUrl;
      }
      return "/src/editor.worker.js";
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
  };

  languages.registerHoverProvider("javascript", {
    provideHover: (model, position) => {
      return new Promise((resolve) => {
        const line = model.getLineContent(position.lineNumber);
        const flag = /^\/\/\s*@(\w+?)(\s+(.*?)|)$/.exec(line);
        if (flag) {
          resolve({
            contents: [{ value: prompt[flag[1]] }],
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
