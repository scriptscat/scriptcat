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

type SafeSet<T> = Set<T> & {
  add: Set<T>["add"];
  has: Set<T>["has"];
  delete: Set<T>["delete"];
  clear: Set<T>["clear"];
  forEach: Set<T>["forEach"];
};

type SafeMap<K, V> = Map<K, V> & {
  get: Map<K, V>["get"];
  set: Map<K, V>["set"];
  has: Map<K, V>["has"];
  delete: Map<K, V>["delete"];
  clear: Map<K, V>["clear"];
  forEach: Map<K, V>["forEach"];
};

type SafeWeakMap<K extends object, V> = WeakMap<K, V> & {
  get: WeakMap<K, V>["get"];
  set: WeakMap<K, V>["set"];
  has: WeakMap<K, V>["has"];
  delete: WeakMap<K, V>["delete"];
};

const createNativeSet = <T>(values?: readonly T[] | Set<T> | null): SafeSet<T> => {
  const set = new nativeSetConstructor<T>() as SafeSet<T>;
  set.add = nativeSetAdd as SafeSet<T>["add"];
  set.has = nativeSetHas as SafeSet<T>["has"];
  set.delete = nativeSetDelete as SafeSet<T>["delete"];
  set.clear = nativeSetClear as SafeSet<T>["clear"];
  set.forEach = nativeSetForEach as SafeSet<T>["forEach"];
  if (Array.isArray(values)) {
    for (let i = 0; i < values.length; i += 1) set.add(values[i]);
  } else if (values) {
    nativeReflectApply(nativeSetForEach, values, [(value: T) => set.add(value)]);
  }
  return set;
};

const createNativeMap = <K, V>(): SafeMap<K, V> => {
  const map = new nativeMapConstructor<K, V>() as SafeMap<K, V>;
  map.get = nativeMapGet as SafeMap<K, V>["get"];
  map.set = nativeMapSet as SafeMap<K, V>["set"];
  map.has = nativeMapHas as SafeMap<K, V>["has"];
  map.delete = nativeMapDelete as SafeMap<K, V>["delete"];
  map.clear = nativeMapClear as SafeMap<K, V>["clear"];
  map.forEach = nativeMapForEach as SafeMap<K, V>["forEach"];
  return map;
};

const createNativeWeakMap = <K extends object, V>(): SafeWeakMap<K, V> => {
  const map = new nativeWeakMapConstructor<K, V>() as SafeWeakMap<K, V>;
  map.get = nativeWeakMapGet as SafeWeakMap<K, V>["get"];
  map.set = nativeWeakMapSet as SafeWeakMap<K, V>["set"];
  map.has = nativeWeakMapHas as SafeWeakMap<K, V>["has"];
  map.delete = nativeWeakMapDelete as SafeWeakMap<K, V>["delete"];
  return map;
};

export const Native = {
  Set: nativeSetConstructor,
  Map: nativeMapConstructor,
  WeakMap: nativeWeakMapConstructor,
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
  objectAssign: nativeBind(Object.assign, Object),
  objectKeys: nativeBind(Object.keys, Object),
  objectHasOwn: nativeBind(Object.hasOwn, Object),
  objectDefineProperty: nativeBind(Object.defineProperty, Object),
  objectGetOwnPropertyDescriptors: nativeBind(Object.getOwnPropertyDescriptors, Object),
  objectGetOwnPropertyDescriptor: nativeBind(Object.getOwnPropertyDescriptor, Object),
  objectGetPrototypeOf: nativeBind(Object.getPrototypeOf, Object),
  reflectOwnKeys: nativeBind(Reflect.ownKeys, Reflect),
  reflectGet: nativeBind(Reflect.get, Reflect),
  createSet: createNativeSet,
  createMap: createNativeMap,
  createWeakMap: createNativeWeakMap,
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
