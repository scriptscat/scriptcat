// 避免在全局页面环境中，内置处理函数被篡改或重写
const unsupportedAPI = () => {
  throw "unsupportedAPI";
};

// 在页面或用户脚本替换调用内建函数前完成捕获。
export const nativeReflectApply = Reflect.apply;
const nativeFunctionBind = Function.prototype.bind;

export const nativeApply = (fn: (...args: any[]) => any, receiver: any, args: any[]) =>
  nativeReflectApply(fn, receiver, args);
export const nativeCall = (fn: (...args: any[]) => any, receiver: any, ...args: any[]) =>
  nativeReflectApply(fn, receiver, args);
export const nativeBind = (fn: (...args: any[]) => any, receiver: any, ...args: any[]) =>
  nativeReflectApply(nativeFunctionBind, fn, [receiver, ...args]);

export const Native = {
  apply: nativeApply,
  call: nativeCall,
  bind: nativeBind,
  reflectApply: nativeReflectApply,
  structuredClone: typeof structuredClone === "function" ? structuredClone : unsupportedAPI,
  jsonStringify: nativeBind(JSON.stringify, JSON),
  jsonParse: nativeBind(JSON.parse, JSON),
  createElement: Document.prototype.createElement,
  ownFragment: new DocumentFragment(),
  objectCreate: nativeBind(Object.create, Object),
  objectGetOwnPropertyDescriptors: nativeBind(Object.getOwnPropertyDescriptors, Object),
  objectGetOwnPropertyDescriptor: nativeBind(Object.getOwnPropertyDescriptor, Object),
  objectGetPrototypeOf: nativeBind(Object.getPrototypeOf, Object),
} as const;

export const customClone = (o: any) => {
  // 非对象类型直接返回（包含 Symbol、undefined、基本类型等）
  // 接受参数：阵列、物件、null
  if (typeof o !== "object") return o;

  try {
    // 优先使用 structuredClone，支持大多数可克隆对象
    return Native.structuredClone(o);
  } catch {
    // 例如：被 Proxy 包装的对象（如 Vue 等框架处理过的 reactive 对象）
    // structuredClone 可能会失败，忽略错误继续尝试其他方式
  }

  try {
    // 退而求其次，使用 JSON 序列化方式进行深拷贝
    // 仅适用于可被 JSON 表示的普通对象
    return Native.jsonParse(Native.jsonStringify(o));
  } catch {
    // 序列化失败，忽略错误
  }

  // 其他无法克隆的非法对象，例如 window、document 等
  console.error("customClone failed");
  return undefined;
};

/** is Firefox browser? */
//@ts-ignore
const bFirefox = typeof mozInnerScreenX === "number";
/** is Firefox browser and running in isolated environment? */
const bFirefoxIsolatedScript =
  //@ts-ignore
  bFirefox && typeof wrappedJSObject !== "undefined" && Object.hasOwn(window, "wrappedJSObject");
/** is Firefox browser and running in isolated userscript API environment? */
const isFFContent =
  //@ts-ignore
  bFirefoxIsolatedScript && typeof browser === "object" && typeof browser?.runtime?.sendMessage === "function";

/** Required for Firefox */
export const localizeObject = isFFContent
  ? <T = object>(script: T): T => customClone(script)
  : <T = object>(script: T): T => script;
