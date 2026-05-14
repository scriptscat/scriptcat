import type { SCMetadata, ScriptRunResource, TScriptInfo } from "@App/app/repo/scripts";
import type { ScriptFunc } from "./types";
import type { ScriptLoadInfo } from "../service_worker/types";
import { DefinedFlags } from "../service_worker/runtime.consts";
import { sourceMapTo } from "@App/pkg/utils/utils";
import { ScriptEnvTag } from "@Packages/message/consts";

export type CompileScriptCodeResource = {
  name: string;
  code: string;
  require: Array<{ url: string; content: string }>;
  isContextMenu: boolean;
};

// 参考了tm的实现
export const waitBody = (callback: () => void) => {
  // 只读取一次 document，避免重复访问 getter
  let doc: Document | null = document;

  // body 已存在，直接执行回调
  if (doc.body) {
    try {
      callback();
    } catch {
      // 屏蔽错误，防止脚本报错导致后续脚本无法执行
    }
    return;
  }

  let handler: ((this: Document, ev: Event) => void) | null = function () {
    // 通常只需等待 body 就绪
    // 兼容少数页面在加载过程中替换 document 的情况
    if (this.body || document !== this) {
      // 确保只清理一次，防止因页面代码骑劫使移除失败后反复触发
      if (handler !== null) {
        this.removeEventListener("load", handler, false);
        this.removeEventListener("DOMNodeInserted", handler, false);
        this.removeEventListener("DOMContentLoaded", handler, false);
        handler = null; // 释放引用，便于 GC

        // 兼容 document 被替换时重新执行
        waitBody(callback);
      }
    }
  };

  // 注意：避免使用 EventListenerObject
  // 某些页面会 hook 事件 API，导致EventListenerObject的监听器或会失灵
  doc.addEventListener("load", handler, false);
  doc.addEventListener("DOMNodeInserted", handler, false);
  doc.addEventListener("DOMContentLoaded", handler, false);

  doc = null; // 释放引用，便于 GC
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
    isContextMenu: isContextMenuScript(scriptRes.metadata),
  });
}

const addTryCatch = (code: string) =>
  `
      try {
        {{functionBody}}
      } catch (e) {
        if (e.message && e.stack) {
            console.error("ERROR: Execution of script '" + arguments[1] + "' failed! " + e.message);
            console.log(e.stack);
        } else {
            console.error(e);
        }
      }
  `
    .trim()
    .replace(/[\r\n]/g, "")
    .replace(/\s+/g, " ")
    .replace("{{functionBody}}", () => code);

export function compileScriptCodeByResource(resource: CompileScriptCodeResource): string {
  const requireCode = resource.require.map((r) => r.content).join("\n;");
  const preCode = requireCode; // 不需要 async 封装
  let code = resource.code; // 需要 async 封装, 可top-level await
  // context 和 name 以unnamed arguments方式导入。避免代码能直接以变量名存取
  // this = context: globalThis
  // arguments = [named: Object, scriptName: string]
  // 使用sandboxContext时，arguments[0]为undefined, this.$则为一次性Proxy变量，用于全域拦截context
  // 非沙盒环境时，先读取 arguments[0]，因此不会读取页面环境的 this.$
  // 在UserScripts API中，由于执行不是在物件导向里呼叫，使用arrow function的话会把this改变。须使用 .call(this) [ 或 .bind(this)() ]

  if (resource.isContextMenu) {
    code = `GM_registerMenuCommand((${JSON.stringify(resource.name)}), ()=>{\n${code}\n}, {nested:false});\n`;
  }

  const joinedCode = [
    "with(arguments[0]||this.$){",
    `${preCode}`,
    "return(async function(){",
    `${code}`,
    "}).call(this);}",
  ]
    .filter(Boolean)
    .join("\n");
  const codeBody = addTryCatch(joinedCode);
  return `${codeBody}${sourceMapTo(`${resource.name}.user.js`)}\n`;
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
 * 脚本加载信息。（Inject/Content环境用，避免过多不必要信息公开，减少页面加载信息存储量）
 */
export const trimScriptInfo = (script: ScriptLoadInfo): TScriptInfo => {
  // --- 处理 resource ---
  // 由于不需要 complie code, resource 只用在 GM_getResourceURL 和 GM_getResourceText
  const resource = {} as Record<string, { base64?: string; content: string; contentType: string }>;
  if (script.resource) {
    for (const [url, { base64, content, contentType }] of Object.entries(script.resource || {})) {
      resource[url] = { base64, content, contentType };
    }
  }
  // --- 处理 resource ---
  // --- 处理 scriptInfo ---
  const scriptInfo = { ...script, resource, code: "" } as TScriptInfo;
  // 删除其他不需要注入的 script 信息
  delete scriptInfo.originalMetadata;
  delete scriptInfo.selfMetadata;
  delete scriptInfo.lastruntime;
  delete scriptInfo.nextruntime;
  delete scriptInfo.ignoreVersion; // UserScript 里面不需要知道用户有没有在更新时忽略
  delete scriptInfo.sort; // UserScript 里面不需要知道用户如何 sort
  delete scriptInfo.error;
  delete scriptInfo.subscribeUrl; // UserScript 里面不需要知道用户从何处订阅
  delete scriptInfo.originDomain; // 脚本来源域名
  delete scriptInfo.origin; // 脚本来源
  delete scriptInfo.runStatus; // 前台脚本不用
  delete scriptInfo.type; // 脚本类型总是普通脚本
  delete scriptInfo.status; // 脚本状态总是启用
  // --- 处理 scriptInfo ---
  return scriptInfo;
};

/**
 * 将脚本函数编译为预注入脚本代码
 */
export function compilePreInjectScript(
  script: ScriptLoadInfo,
  scriptCode: string,
  autoDeleteMountFunction: boolean = false
): string {
  const scriptEnvTag = isInjectIntoContent(script.metadata) ? ScriptEnvTag.content : ScriptEnvTag.inject;
  const eventNamePrefix = `evt${process.env.SC_RANDOM_KEY}.${scriptEnvTag}`; // 仅用于early-start初始化
  const flag = `${script.flag}`;
  const scriptInfo = trimScriptInfo(script);
  const scriptInfoJSON = `${JSON.stringify(scriptInfo)}`;
  const autoDeleteMountCode = autoDeleteMountFunction ? `try{delete window['${flag}']}catch(e){}` : "";
  const evScriptLoad = `${eventNamePrefix}${DefinedFlags.scriptLoadComplete}`;
  const evEnvLoad = `${eventNamePrefix}${DefinedFlags.envLoadComplete}`;
  return `window['${flag}'] = function(){${autoDeleteMountCode}${scriptCode}};
{
  let o = { cancelable: true, detail: { scriptFlag: '${flag}', scriptInfo: (${scriptInfoJSON}) } },
  c = typeof cloneInto === "function" ? cloneInto(o, performance) : o,
  f = () => performance.dispatchEvent(new CustomEvent('${evScriptLoad}', c)),
  needWait = f();
  if (needWait) performance.addEventListener('${evEnvLoad}', f, { once: true });
}
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

export function addStyleSheet(css: string): CSSStyleSheet {
  // see https://unarist.hatenablog.com/entry/2020/07/06/012540
  const sheet = new CSSStyleSheet();
  // it might return as Promise
  sheet.replaceSync(css);
  // adoptedStyleSheets is FrozenArray so it has to be re-assigned.
  document.adoptedStyleSheets = document.adoptedStyleSheets.concat(sheet);
  return sheet;
}

export function metadataBlankOrTrue(metadata: SCMetadata, key: string): boolean {
  const s = metadata[key]?.[0];
  return s === "" || s === "true";
}

export function isContextMenuScript(metadata: SCMetadata): boolean {
  return metadata["run-at"]?.[0] === "context-menu";
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
