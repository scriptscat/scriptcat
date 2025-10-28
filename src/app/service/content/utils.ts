import type { SCMetadata, ScriptRunResource } from "@App/app/repo/scripts";
import type { ScriptFunc } from "./types";
import type { ScriptLoadInfo } from "../service_worker/types";

export type CompileScriptCodeResource = {
  name: string;
  code: string;
  require: Array<{ url: string; content: string }>;
};

// 根据ScriptRunResource获取require的资源
export function getScriptRequire(scriptRes: ScriptRunResource): CompileScriptCodeResource["require"] {
  const resourceArray = new Array<{ url: string; content: string }>();
  if (Array.isArray(scriptRes.metadata.require)) {
    for (const val of scriptRes.metadata.require) {
      const res = scriptRes.resource[val];
      if (res) {
        resourceArray.push({ url: res.url, content: res.content });
      }
    }
  }
  return resourceArray;
}

/**
 * 构建脚本运行代码
 * @see {@link ExecScript}
 * @param scriptRes
 * @param scriptCode
 * @returns
 */
export function compileScriptCode(scriptRes: ScriptRunResource, scriptCode?: string): string {
  scriptCode = scriptCode ?? scriptRes.code;
  const requireArray = getScriptRequire(scriptRes);
  return compileScriptCodeByResource({
    name: scriptRes.name,
    code: scriptCode,
    require: requireArray,
  });
}

export function compileScriptCodeByResource(resource: CompileScriptCodeResource): string {
  const sourceURL = `//# sourceURL=${chrome.runtime.getURL(`/${encodeURI(resource.name)}.user.js`)}`;
  const requireCode = resource.require.map((r) => r.content).join("\n");
  const preCode = [requireCode].join("\n"); // 不需要 async 封装
  const code = [resource.code, sourceURL].join("\n"); // 需要 async 封装, 可top-level await
  // context 和 name 以unnamed arguments方式导入。避免代码能直接以变量名存取
  // this = context: globalThis
  // arguments = [named: Object, scriptName: string]
  // 使用sandboxContext时，arguments[0]为undefined, this.$则为一次性Proxy变量，用於全域拦截context
  // 非沙盒环境时，先读取 arguments[0]，因此不会读取页面环境的 this.$
  // 在UserScripts API中，由於执行不是在物件导向裡呼叫，使用arrow function的话会把this改变。须使用 .call(this) [ 或 .bind(this)() ]
  return `try {
  with(arguments[0]||this.$){
${preCode}
    return (async function(){
${code}
    }).call(this);
  }
} catch (e) {
  if (e.message && e.stack) {
      console.error("ERROR: Execution of script '" + arguments[1] + "' failed! " + e.message);
      console.log(e.stack);
  } else {
      console.error(e);
  }
}`;
}

// 通过脚本代码编译脚本函数
export function compileScript(code: string): ScriptFunc {
  return <ScriptFunc>new Function(code);
}

/**
 * 将脚本函数编译为注入脚本代码
 * @param script
 * @param scriptCode
 * @param [autoDeleteMountFunction=false] 是否自动删除挂载的函数
 */
export function compileInjectScript(
  script: ScriptRunResource,
  scriptCode: string,
  autoDeleteMountFunction: boolean = false
): string {
  return compileInjectScriptByFlag(script.flag, scriptCode, autoDeleteMountFunction);
}

export function compileInjectScriptByFlag(
  flag: string,
  scriptCode: string,
  autoDeleteMountFunction: boolean = false
): string {
  const autoDeleteMountCode = autoDeleteMountFunction ? `try{delete window['${flag}']}catch(e){}` : "";
  return `window['${flag}'] = function(){${autoDeleteMountCode}${scriptCode}}`;
}

/**
 * 将脚本函数编译为预注入脚本代码
 */
export function compilePreInjectScript(
  messageFlag: string,
  script: ScriptLoadInfo,
  scriptCode: string,
  autoDeleteMountFunction: boolean = false
): string {
  const eventName = isInjectIntoContent(script.metadata) ? "ct" : "fd";
  const autoDeleteMountCode = autoDeleteMountFunction ? `try{delete window['${script.flag}']}catch(e){}` : "";
  return `window['${script.flag}'] = {
  scriptInfo: ${JSON.stringify(script)},
  func: function(){${autoDeleteMountCode}${scriptCode}}
};
(() => {
  const f = () => {
    const event = new CustomEvent('sc${messageFlag}', 
    { cancelable: true, detail: { scriptFlag: '${script.flag}' } });
    return window.dispatchEvent(event); // checkEarlyStartScript 先执行的话，这里回传 false
  };
  const noCheckEarlyStartScript = f(); // checkEarlyStartScript 先执行的话，这里的 f() 会直接触发execEarlyScript； dispatchEvent 会回传 false
  if (noCheckEarlyStartScript) { // checkEarlyStartScript 未执行
    // 使用 dispatchEvent 回传值判断避免注册一堆不会呼叫的 eventHandler
    window.addEventListener('${eventName}ld${messageFlag}', f, { once: true }); // 如checkEarlyStartScript 先执行，这个较后的event不会被呼叫。
    // once: true 使呼叫后立即移除监听
  }
})();
`;
}

export function addStyle(css: string): HTMLStyleElement {
  const dom = document.createElement("style");
  dom.textContent = css;
  if (document.head) {
    return document.head.appendChild(dom);
  }
  return document.documentElement.appendChild(dom);
}

export function metadataBlankOrTrue(metadata: SCMetadata, key: string): boolean {
  const s = metadata[key]?.[0];
  return s === "" || s === "true";
}

export function isEarlyStartScript(metadata: SCMetadata): boolean {
  return metadataBlankOrTrue(metadata, "early-start") && metadata["run-at"]?.[0] === "document-start";
}

export function isInjectIntoContent(metadata: SCMetadata): boolean {
  return metadata["inject-into"]?.[0] === "content";
}

export const getScriptFlag = (uuid: string) => {
  // scriptFlag 对同一脚本永远一致。重新开启浏览器也不会变。
  // 实作内容有待检讨
  return `#-${uuid}`;
};

// 监听属性设置
export function definePropertyListener<T>(obj: any, prop: string, listener: (val: T) => void) {
  if (obj[prop] !== undefined) {
    listener(obj[prop]);
    delete obj[prop];
    return;
  }
  Object.defineProperty(obj, prop, {
    configurable: true,
    set: (val: any) => {
      delete obj[prop]; // 删除 property setter
      listener(val);
    },
  });
}
