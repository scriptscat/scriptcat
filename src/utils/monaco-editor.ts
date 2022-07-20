// @ts-ignore
// eslint-disable-next-line import/no-unresolved
import dts from "@App/types/scriptcat";
import { languages } from "monaco-editor";

export default function registerEditor() {
  // @ts-ignore
  window.MonacoEnvironment = {
    getWorkerUrl(moduleId: any, label: any) {
      if (label === "typescript" || label === "javascript") {
        return "/src/ts.worker.js";
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
