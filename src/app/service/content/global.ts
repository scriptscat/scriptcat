// 避免在全局页面环境中，内置处理函数被篡改或重写

// 在页面或用户脚本替换调用内建函数前完成捕获。
export const nativeReflectApply = Reflect.apply;
const nativeFunctionBind = Function.prototype.bind;
const nativeFunctionToString = Function.prototype.toString;
const nativeDocument = typeof document === "undefined" ? undefined : document;
// structuredClone 不用 bind globalThis; nativeStructuredClone 在初期化時捕获。
const nativeStructuredClone = typeof structuredClone === "function" ? structuredClone : undefined;
const nativeSetConstructor = Set;
const nativeSetAdd = Set.prototype.add;
const nativeSetHas = Set.prototype.has;
const nativeSetDelete = Set.prototype.delete;
const nativeSetClear = Set.prototype.clear;
const nativeSetForEach = Set.prototype.forEach;
const nativeSetValues = Set.prototype.values;
const nativeArrayIsArray = Array.isArray;
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
const nativeReflectOwnKeys = Reflect.ownKeys;
const nativeObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const nativeDocumentCreateElement = typeof Document === "undefined" ? undefined : Document.prototype.createElement;
const nativeOwnFragment = typeof DocumentFragment === "undefined" ? undefined : new DocumentFragment();

// Keep the captured methods on private subclasses. Instances can then be created
// without reassigning every method, while the subclass prototypes remain outside
// the page's mutable built-in prototypes.
const NativeSetConstructor = class<T> extends nativeSetConstructor<T> {
  constructor(values?: readonly T[] | Set<T> | null) {
    // 不把 values 传给 Set 构造器：它会读取 values 的 @@iterator，而页面可改写该方法。
    super();
    if (nativeArrayIsArray(values)) {
      for (let i = 0; i < values.length; i += 1) this.add(values[i]);
    } else if (values) {
      nativeReflectApply(nativeSetForEach, values, [(value: T) => this.add(value)]);
    }
  }
};
NativeSetConstructor.prototype.add = nativeSetAdd;
NativeSetConstructor.prototype.has = nativeSetHas;
NativeSetConstructor.prototype.delete = nativeSetDelete;
NativeSetConstructor.prototype.clear = nativeSetClear;
NativeSetConstructor.prototype.forEach = nativeSetForEach;
NativeSetConstructor.prototype.values = nativeSetValues;
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
  functionToString: (fn: object) => nativeReflectApply(nativeFunctionToString, fn, []) as string,
  document: nativeDocument,
  structuredClone: nativeStructuredClone,
  jsonStringify: nativeBind(JSON.stringify, JSON),
  jsonParse: nativeBind(JSON.parse, JSON),
  createElement: nativeDocumentCreateElement,
  ownFragment: nativeOwnFragment,
  objectCreate: nativeBind(Object.create, Object),
  objectAssign: nativeBind(Object.assign, Object),
  arrayIsArray: nativeArrayIsArray,
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
  // 非对象类型直接返回（包含 undefined、基本类型等）；函数和 Symbol 不可跨边界传输。
  // 接受参数：阵列、物件、null
  if (o === null || typeof o !== "object") {
    return typeof o === "function" || typeof o === "symbol" ? undefined : o;
  }

  // 先验证自有字段都是数据描述符，避免 JSON fallback 执行页面 getter 或 Proxy trap。
  const seen = new Native.WeakMap<object, true>();
  const isDataOnly = (value: object): boolean => {
    if (seen.has(value)) return true;
    seen.set(value, true);

    // Map/Set 条目不在自有属性中，必须先检查，避免 structuredClone 遍历时触发嵌套访问器。
    try {
      let valid = true;
      nativeReflectApply(nativeMapForEach, value as Map<unknown, unknown>, [
        (key: unknown, entry: unknown) => {
          if (valid && (!isDataOnlyValue(key) || !isDataOnlyValue(entry))) valid = false;
        },
      ]);
      return valid;
    } catch {
      // 不是 Map，继续检查普通自有属性。
    }
    try {
      let valid = true;
      nativeReflectApply(nativeSetForEach, value as Set<unknown>, [
        (entry: unknown) => {
          if (valid && !isDataOnlyValue(entry)) valid = false;
        },
      ]);
      return valid;
    } catch {
      // 不是 Set，继续检查普通自有属性。
    }

    let keys: PropertyKey[];
    try {
      keys = nativeReflectOwnKeys(value);
    } catch {
      return false;
    }
    for (const key of keys) {
      if (typeof key === "symbol") return false;
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = nativeObjectGetOwnPropertyDescriptor(value, key);
      } catch {
        return false;
      }
      if (!descriptor || !("value" in descriptor)) return false;
      if (
        typeof descriptor.value === "function" ||
        (descriptor.value !== null && typeof descriptor.value === "object" && !isDataOnly(descriptor.value))
      ) {
        return false;
      }
    }
    return true;
  };
  const isDataOnlyValue = (value: unknown): boolean => {
    if (value === null || typeof value !== "object") return true;
    return isDataOnly(value);
  };
  if (!isDataOnly(o)) return undefined;

  if (nativeStructuredClone) {
    try {
      // 优先使用 structuredClone，支持大多数可克隆对象
      return nativeStructuredClone(o);
    } catch {
      // structuredClone 拒绝的值不再退回会执行 getter 的 JSON 序列化。
      return undefined;
    }
  }

  try {
    // 旧浏览器没有 structuredClone 时，只复制已验证的数据属性。
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
