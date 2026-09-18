// 避免在全局页面环境中，内置处理函数被篡改或重写
const unsupportedAPI = () => {
  throw "unsupportedAPI";
};

// 在页面或用户脚本替换调用内建函数前完成捕获。
export const nativeReflectApply = Reflect.apply;
const nativeFunctionBind = Function.prototype.bind;
const nativeSetConstructor = Set;
const nativeSetAdd = Set.prototype.add;
const nativeSetHas = Set.prototype.has;
const nativeSetDelete = Set.prototype.delete;
const nativeSetClear = Set.prototype.clear;
const nativeSetForEach = Set.prototype.forEach;
const nativeMapConstructor = Map;
const nativeMapGet = Map.prototype.get;
const nativeMapSet = Map.prototype.set;
const nativeMapHas = Map.prototype.has;
const nativeMapDelete = Map.prototype.delete;
const nativeMapClear = Map.prototype.clear;
const nativeMapForEach = Map.prototype.forEach;
const nativeWeakMapConstructor = WeakMap;
const nativeWeakMapGet = WeakMap.prototype.get;
const nativeWeakMapSet = WeakMap.prototype.set;
const nativeWeakMapHas = WeakMap.prototype.has;
const nativeWeakMapDelete = WeakMap.prototype.delete;
const nativeObjectFreeze = Object.freeze;

// Keep the captured methods on private subclasses. Instances can then be created
// without reassigning every method, while the subclass prototypes remain outside
// the page's mutable built-in prototypes.
const NativeSetConstructor = class<T> extends nativeSetConstructor<T> {
  constructor(values?: readonly T[] | Set<T> | null) {
    super();
    if (Array.isArray(values)) {
      for (let i = 0; i < values.length; i += 1) {
        nativeReflectApply(nativeSetAdd, this, [values[i]]);
      }
    } else if (values) {
      nativeReflectApply(nativeSetForEach, values, [(value: T) => nativeReflectApply(nativeSetAdd, this, [value])]);
    }
  }
};
NativeSetConstructor.prototype.add = nativeSetAdd;
NativeSetConstructor.prototype.has = nativeSetHas;
NativeSetConstructor.prototype.delete = nativeSetDelete;
NativeSetConstructor.prototype.clear = nativeSetClear;
NativeSetConstructor.prototype.forEach = nativeSetForEach;
nativeObjectFreeze(NativeSetConstructor.prototype);

const NativeMapConstructor = class<K, V> extends nativeMapConstructor<K, V> {};
NativeMapConstructor.prototype.get = nativeMapGet;
NativeMapConstructor.prototype.set = nativeMapSet;
NativeMapConstructor.prototype.has = nativeMapHas;
NativeMapConstructor.prototype.delete = nativeMapDelete;
NativeMapConstructor.prototype.clear = nativeMapClear;
NativeMapConstructor.prototype.forEach = nativeMapForEach;
nativeObjectFreeze(NativeMapConstructor.prototype);

const NativeWeakMapConstructor = class<K extends object, V> extends nativeWeakMapConstructor<K, V> {};
NativeWeakMapConstructor.prototype.get = nativeWeakMapGet;
NativeWeakMapConstructor.prototype.set = nativeWeakMapSet;
NativeWeakMapConstructor.prototype.has = nativeWeakMapHas;
NativeWeakMapConstructor.prototype.delete = nativeWeakMapDelete;
nativeObjectFreeze(NativeWeakMapConstructor.prototype);

const nativeFunctionApply = nativeReflectApply(nativeFunctionBind, Function.prototype.apply, [
  Function.prototype.apply,
]) as (fn: (...args: any[]) => any, receiver: any, args: any[]) => any;
const nativeFunctionCall = nativeReflectApply(nativeFunctionBind, Function.prototype.call, [
  Function.prototype.call,
]) as (fn: (...args: any[]) => any, receiver: any, ...args: any[]) => any;

export const nativeApply = nativeFunctionApply;
export const nativeCall = nativeFunctionCall;
export const nativeBind = (fn: (...args: any[]) => any, receiver: any, ...args: any[]) =>
  nativeFunctionCall(nativeFunctionBind, fn, receiver, ...args);

export const Native = {
  Set: NativeSetConstructor,
  Map: NativeMapConstructor,
  WeakMap: NativeWeakMapConstructor,
  bind: nativeBind,
  reflectApply: nativeReflectApply,
  structuredClone: typeof structuredClone === "function" ? structuredClone : unsupportedAPI,
  jsonStringify: nativeBind(JSON.stringify, JSON),
  jsonParse: nativeBind(JSON.parse, JSON),
  createElement: Document.prototype.createElement,
  ownFragment: new DocumentFragment(),
  objectCreate: nativeBind(Object.create, Object),
  objectAssign: nativeBind(Object.assign, Object),
  objectKeys: nativeBind(Object.keys, Object),
  objectHasOwn: nativeBind(Object.hasOwn, Object),
  objectDefineProperty: nativeBind(Object.defineProperty, Object),
  objectGetOwnPropertyDescriptors: nativeBind(Object.getOwnPropertyDescriptors, Object),
  objectGetOwnPropertyDescriptor: nativeBind(Object.getOwnPropertyDescriptor, Object),
  objectGetPrototypeOf: nativeBind(Object.getPrototypeOf, Object),
  reflectOwnKeys: nativeBind(Reflect.ownKeys, Reflect),
  reflectGet: nativeBind(Reflect.get, Reflect),
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
