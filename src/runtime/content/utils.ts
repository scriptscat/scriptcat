import { ScriptRunResouce } from "@App/app/repo/scripts";

// 构建脚本运行代码
export function compileScriptCode(scriptRes: ScriptRunResouce): string {
  let { code } = scriptRes;
  let require = "";
  if (scriptRes.metadata.require) {
    scriptRes.metadata.require.forEach((val) => {
      const res = scriptRes.resource[val];
      if (res) {
        require = `${require}\n${res.content}`;
      }
    });
  }
  code = require + code;
  return `with (context) return ((context, fapply, CDATA, uneval, define, module, exports)=>{\n${code}\n//# sourceURL=${chrome.runtime.getURL(
    `/${encodeURI(scriptRes.name)}.user.js`
  )}\n})(context)`;
}

// 构建运行沙盒运行环境
export function buildSandbox(context: any, code: string) {}

// 构建沙盒上下文
export function buildContext() {}
