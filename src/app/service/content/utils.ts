import type { SCMetadata, ScriptRunResource, TScriptInfo } from "@App/app/repo/scripts";
import type { ScriptFunc } from "./types";
import type { ScriptLoadInfo } from "../service_worker/types";
import { DefinedFlags } from "../service_worker/runtime.consts";
import { sourceMapTo } from "@App/pkg/utils/utils";
import { ScriptEnvTag } from "@Packages/message/consts";
import { embeddedPatternCheckerString, type EmbeddedURLRuleEntry, type URLRuleEntry } from "@App/pkg/utils/url_matcher";
import { parseResourceDeclaration } from "@App/pkg/utils/resource";
import { getGrantCandidates } from "./gm_api/grant";
import { customClone } from "./global";

const cloneTransportValue = (value: any) => {
  // USER_SCRIPT 只能接收数据副本；共享 customClone 的 data-only 检查，避免 getter/Proxy 进入页面资料。
  return customClone(value);
};

// 与 rspack 注入的构建级密钥配对；页面只能看到包装函数，拿不到正确的调用标记。
const lnStrIntegrity = process.env.SC_RANDOM_FNKEY;
const znRand = process.env.SC_ZN_RAND;
export const preInjectScriptInfoKey = `${lnStrIntegrity}:scriptInfo`;

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
  const resource = scriptRes.resourceByType?.require || scriptRes.resource;
  if (Array.isArray(scriptRes.metadata.require)) {
    for (const val of scriptRes.metadata.require) {
      const res = resource[val];
      if (res) {
        resourceArray.push({ url: res.url, content: res.content });
      }
    }
  }
  return resourceArray;
}

/**
 * 构建unwrap脚本运行代码
 * @see {@link ExecScript}
 * @param scriptRes
 * @param scriptCode
 * @returns
 */
export function compileScriptletCode(
  scriptRes: ScriptRunResource,
  scriptCode: string,
  scriptUrlPatterns: URLRuleEntry[]
): string {
  scriptCode = scriptCode ?? scriptRes.code;
  const requireArray = getScriptRequire(scriptRes);
  const requireCode = requireArray.map((r) => r.content).join("\n;");
  // 在window[flag]注册一个空脚本让原本的脚本管理器知道并记录脚本成功执行
  const reducedPatterns = scriptUrlPatterns.map(({ ruleType, ruleContent }) => ({
    ruleType,
    ruleContent,
  })) satisfies EmbeddedURLRuleEntry[];
  const urlCondition = embeddedPatternCheckerString("location.href", JSON.stringify(reducedPatterns));
  const codeBody = `if(${urlCondition}){\n${requireCode}\n${scriptCode}\nwindow['${scriptRes.flag}']=function(){};\n}`;
  return `${codeBody}${sourceMapTo(`${scriptRes.name}.user.js`)}\n`;
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
  // 临时方法调用保留 userscript 的 this，避免在页面解析可变的 call/apply/bind。

  if (resource.isContextMenu) {
    // 脚本体整体延后到菜单回调里执行，它自己的 GM_registerMenuCommand 也随之推迟到点击后才注册
    code = `GM_registerMenuCommand((${JSON.stringify(resource.name)}), ()=>{\n${code}\n}, {nested:false});\n`;
  }

  const joinedCode = [
    "with(arguments[0]||this.$){",
    `${preCode}`,
    "this[arguments[0]='$$'+Date.now()/Math.random()]=async function(){",
    `${code}`,
    "};return this[arguments[0]](...((delete this[arguments[0]]),[]));}",
  ]
    .filter(Boolean)
    .join("\n");
  const codeBody = addTryCatch(joinedCode);
  return `${codeBody}${sourceMapTo(`${resource.name}.user.js`)}\n`;
}

const codeFunction = (code: string, scriptInfoJSON?: string) => {
  // 临时方法调用不依赖页面改写的 call、apply、bind；完整性标记也阻止页面直接调用包装器。
  const infoProperty =
    scriptInfoJSON === undefined
      ? ""
      : ` Object.defineProperty(f, '${preInjectScriptInfoKey}', { value: ${JSON.stringify(scriptInfoJSON)} });`;
  return `((k, y, fn) => { const f = (t, u, ...args) => { if (t === k) { u[y] = fn; return u[y](...((delete u[y]), args)) } }; Object.defineProperty(f, k, { value: true });${infoProperty} return f; })('${lnStrIntegrity}', '${znRand}' + Math.random(), function(){${code}})`;
};

// 有 setter 时沿用页面属性语义；否则用不可配置的一次性 getter，避免挂载函数被页面再次取走。
const mountCodeFunction = (flag: string, code: string, scriptInfoJSON?: string) =>
  `((w, k, fn) => { const d = Object.getOwnPropertyDescriptor(w, k); if (d?.set) { w[k] = fn; } else { let mounted = true; Object.defineProperty(w, k, { configurable: false, enumerable: false, get() { if (!mounted) return undefined; mounted = false; return fn; } }); } })(window, '${flag}', ${codeFunction(code, scriptInfoJSON)})`;

const ZFunction = Function;

// 通过脚本代码编译脚本函数
export function compileScript(code: string): ScriptFunc {
  const fn = <ScriptFunc>new ZFunction(code);
  const k = lnStrIntegrity;
  const y = `${znRand}` + Math.random();
  return (t: any, u: any, ...args: any[]) => {
    if (t === k) {
      u[y] = fn;
      return u[y](...(delete u[y], args));
    }
  };
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
  return `${mountCodeFunction(flag, `${autoDeleteMountCode}${scriptCode}`)};`;
}

/**
 * 脚本加载信息。（Inject/Content环境用，避免过多不必要信息公开，减少页面加载信息存储量）
 */
export const trimScriptInfo = (script: ScriptLoadInfo): TScriptInfo => {
  // --- 处理 resource ---
  // 由于不需要 complie code, resource 只用在 GM_getResourceURL 和 GM_getResourceText
  const resource = {} as Record<string, { base64?: string; content: string; contentType: string }>;
  const requireCssResource = {} as Record<string, { base64?: string; content: string; contentType: string }>;
  const resourceByType = script.resourceByType;
  const resourceResources = resourceByType?.resource || script.resource;
  const requireCssResources = resourceByType?.["require-css"] || script.resource;
  for (const name of script.metadata["require-css"] || []) {
    const res = requireCssResources[name];
    if (res) {
      requireCssResource[name] = { base64: res.base64, content: res.content, contentType: res.contentType };
    }
  }
  if (hasResourceGrant(script.metadata)) {
    for (const name of getDeclaredResourceNames(script.metadata)) {
      const res = resourceResources[name];
      if (res) {
        resource[name] = { base64: res.base64, content: res.content, contentType: res.contentType };
      }
    }
  }
  // --- 处理 resource ---
  // --- 处理 scriptInfo ---
  const metadata = Object.fromEntries(
    Object.entries(script.metadata).map(([key, values]) => [key, Array.isArray(values) ? [...values] : values])
  );
  const scriptInfo = {
    ...script,
    metadata,
    value: cloneTransportValue(script.value) ?? {},
    config: script.config === undefined ? undefined : cloneTransportValue(script.config),
    resource,
    requireCssResource,
    code: "",
  } as TScriptInfo;
  // 删除其他不需要注入的 script 信息
  delete scriptInfo.originalMetadata;
  delete scriptInfo.selfMetadata;
  delete scriptInfo.lastruntime;
  delete scriptInfo.nextruntime;
  delete scriptInfo.ignoreVersion; // UserScript 里面不需要知道用户有没有在更新时忽略
  delete scriptInfo.sort; // UserScript 里面不需要知道用户如何 sort
  delete scriptInfo.error;
  delete scriptInfo.resourceByType;
  delete scriptInfo.subscribeUrl; // UserScript 里面不需要知道用户从何处订阅
  delete scriptInfo.originDomain; // 脚本来源域名
  delete scriptInfo.origin; // 脚本来源
  delete scriptInfo.runStatus; // 前台脚本不用
  delete scriptInfo.type; // 脚本类型总是普通脚本
  delete scriptInfo.status; // 脚本状态总是启用
  delete scriptInfo.executionHandle;
  delete scriptInfo.executionEnvTag;
  // 这些绑定令牌只在隔离 broker 内有效，不能随脚本资料暴露给页面或 USER_SCRIPT。
  delete scriptInfo.executionRunFlag;
  // --- 处理 scriptInfo ---
  return scriptInfo;
};

/**
 * 预注入事件会经过页面可观察的 performance 通道；不要把用户值或配置放进它的 detail。
 * 资源仍需在脚本最早执行时可用，后续 pageLoad 会补回权威的值与配置。
 */
export const trimPreInjectScriptInfo = (script: ScriptLoadInfo): TScriptInfo => {
  const scriptInfo = trimScriptInfo(script);
  scriptInfo.value = {};
  scriptInfo.config = undefined;
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
  const scriptInfo = trimPreInjectScriptInfo(script);
  const scriptInfoJSON = `${JSON.stringify(scriptInfo)}`;
  const scriptUrlPatterns = script.scriptUrlPatterns?.map(({ ruleType, ruleContent }) => ({ ruleType, ruleContent }));
  const urlCondition = scriptUrlPatterns
    ? embeddedPatternCheckerString("location.href", JSON.stringify(scriptUrlPatterns))
    : "true";
  const autoDeleteMountCode = autoDeleteMountFunction ? `try{delete window['${flag}']}catch(e){}` : "";
  const evScriptLoad = `${eventNamePrefix}${DefinedFlags.scriptLoadComplete}`;
  const evEnvLoad = `${eventNamePrefix}${DefinedFlags.envLoadComplete}`;
  return `{
  let mounted = false,
    f = () => {
    if (!(${urlCondition})) return false;
    if (!mounted) {
      ${mountCodeFunction(flag, `${autoDeleteMountCode}${scriptCode}`, scriptInfoJSON)};
      mounted = true;
    }
    const o = { cancelable: true, detail: { scriptFlag: '${flag}' } },
      c = typeof cloneInto === "function" ? cloneInto(o, performance) : o;
    return performance.dispatchEvent(new CustomEvent('${evScriptLoad}', c));
  },
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

export function isScriptletUnwrap(metadata: SCMetadata): boolean {
  return metadataBlankOrTrue(metadata, "unwrap");
}

export function isInjectIntoContent(metadata: SCMetadata): boolean {
  return metadata["inject-into"]?.[0] === "content";
}

const resourceGrantNames = new Set([
  "GM_getResourceText",
  "GM_getResourceURL",
  "GM.getResourceText",
  "GM.getResourceUrl",
]);

const getDeclaredResourceNames = (metadata: SCMetadata): Set<string> => {
  const names = new Set<string>();
  for (const value of metadata.resource || []) {
    const declaration = parseResourceDeclaration(value);
    if (declaration) {
      names.add(declaration.name);
    }
  }
  return names;
};

const hasResourceGrant = (metadata: SCMetadata): boolean => {
  const grants = new Set(metadata.grant || []);
  if (grants.has("none") && !isContextMenuScript(metadata)) {
    return false;
  }
  return [...grants].some((grant) => getGrantCandidates(grant).some((candidate) => resourceGrantNames.has(candidate)));
};

export const getScriptFlag = (uuid: string) => {
  // scriptFlag 对同一脚本永远一致。重新开启浏览器也不会变。
  // 实作内容有待检讨
  return `#-${uuid}`;
};

// 监听属性设置
export function definePropertyListener<T>(obj: any, prop: string, listener: (val: T) => void) {
  const sameProperty = (left: PropertyDescriptor | undefined, right: PropertyDescriptor | undefined) =>
    left?.configurable === right?.configurable &&
    left?.enumerable === right?.enumerable &&
    left?.value === right?.value &&
    left?.get === right?.get &&
    left?.set === right?.set;
  const current = obj[prop];
  if (current !== undefined) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
    listener(current);
    // 页面可能在回调里替换属性；只有描述符仍是原来的才可以清理自身监听器。
    if (sameProperty(descriptor, Object.getOwnPropertyDescriptor(obj, prop)) && descriptor?.configurable) {
      delete obj[prop];
    }
    return;
  }
  const setter = (val: T) => {
    listener(val);
    const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
    // 不删除页面后来安装的 setter，只删除本函数仍拥有的那一个。
    if (descriptor?.configurable && descriptor.set === setter) {
      delete obj[prop];
    }
  };
  Object.defineProperty(obj, prop, {
    configurable: true,
    set: setter,
  });
}
