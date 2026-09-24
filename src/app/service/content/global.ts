// 避免在全局页面环境中，内置处理函数被篡改或重写

// 在页面或用户脚本替换调用内建函数前完成捕获。
export const nativeReflectApply = Reflect.apply;
const nativeFunctionBind = Function.prototype.bind;
// Wrapper inspection runs after page scripts can replace both values.
const nativeFunctionToString = Function.prototype.toString;
const nativeDocument = typeof document === "undefined" ? undefined : document;
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
// Reflect.apply 把 [receiver] 当作 array-like 消费，不读取其 @@iterator，
// 因此页面篡改 Array.prototype[Symbol.iterator] 不会影响绑定过程。
export const nativeBind = (fn: (...args: any[]) => any, receiver: any) =>
  nativeReflectApply(nativeFunctionBind, fn, [receiver]);

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

// ============================================================================
// 可信数据安装：替代特权状态回填场景下的 Object.assign
// ============================================================================
// Object.assign(target, source) 的 CopyDataProperties 语义会：读取 source 的每个 own
// enumerable key（若该 key 是 accessor 则执行其 getter）；对 target 做普通 [[Set]]（若 target
// 自身没有该 key 的 own 属性，会沿原型链查找继承的 setter 并调用它；若 key 恰好是
// "__proto__"，继承自 Object.prototype 的 __proto__ setter 会真的改写 target 的原型）。
// 这些都是"普通 JavaScript 赋值语义"的一部分，对不可信或半可信的对象生效时就是安全隐患——
// 与调用哪一份 Object.assign 实现（是否被页面替换）无关，Native.objectAssign 只保护函数引用
// 本身不被替换，不改变上述语义。
//
// installTrustedDataPropertiesStrict / refreshExposedDataProperties 是两个共享同一份
// descriptor-safe 安装逻辑的具名策略，用于把一份"纯数据"来源的字段安装到目标对象上：
//   - 只读取 source 的 own enumerable *data* descriptor（`"value" in descriptor`），
//     从不读取/执行 accessor 的 getter；
//   - 只用 Native.objectDefineProperty 直接在 target 上定义/更新 own data property，
//     从不做普通 [[Set]]，因此不会触发 target 自身或继承的 setter，也不会触发
//     Object.prototype.__proto__ 的原型变更语义（"__proto__" 会被当成普通字符串 key）。
//
// 这两个函数只服务于本仓库里"内部纯数据记录安装到内部/半内部对象"这一类场景（早期脚本
// 状态回填、GM_Base 初始化、暴露给脚本的 GM_info 刷新），不是通用 Object.assign 替代品：
// 按现有调用点的实际数据形状，只处理字符串 key（符号 key 会被跳过，与本文件另一处
// copyOwnEnumerableDataProperties 风格的既有约定一致），调用方需自行保证 source 本身
// 是内部可信的纯数据对象。
const readOwnStringKeyedDataProperties = (source: object): Array<[string, unknown]> => {
  const keys = nativeReflectOwnKeys(source);
  const entries: Array<[string, unknown]> = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string") continue;
    const descriptor = nativeObjectGetOwnPropertyDescriptor(source, key);
    if (!descriptor || !descriptor.enumerable) continue;
    if (!("value" in descriptor)) {
      // 这三个调用点的 source 约定为内部纯数据；accessor 说明该内部契约已被破坏，
      // 不应该静默跳过（会丢字段）也不应该执行它（会把访问器当数据源信任）。
      throw new TypeError(`installTrustedDataProperties: source has an accessor own property "${key}"`);
    }
    entries.push([key, descriptor.value]);
  }
  return entries;
};

// target 已有的 own 属性若是 non-configurable 且无法只更新 value（accessor，或
// non-configurable 且不可写的 data property），说明这个 key 无法在不执行任何 setter/不改变
// 语义的前提下安全安装：
//   "throw" —— 内部可信目标（scriptRes、GM_Base）视为契约被破坏，直接失败，绝不调用 setter；
//   "skip"  —— 面向脚本暴露的信息对象（GM_info）：脚本可能故意在自己的字段上放了
//              non-configurable accessor 来"锁死"它，这是脚本对自己信息面的合法操作，
//              不能因此阻断内部权威状态的回填——跳过这一个 key，绝不调用它的 setter，
//              继续安装其余字段。
// 传给 Object.defineProperty 的 descriptor 参数本身也是一个普通对象，会继承 Object.prototype；
// 如果直接用对象字面量 {value} / {configurable, enumerable, writable, value} 构造它，页面/脚本
// 预先在 Object.prototype 上放置的 get/set 会让这份字面量"看起来"同时具备 value 和继承来的
// accessor，触发 "Invalid property descriptor: Cannot both specify accessors and a value or
// writable attribute" TypeError——这与本文件其余 descriptor 构造已经统一采用的
// `Native.objectCreate(null)` 惯例（见 create_context.ts 的 readonlyCompatDescriptor）是同一个
// 问题、同一个修法：用 null 原型对象构造 descriptor，再用普通赋值填字段（null 原型没有任何
// 继承 setter，普通赋值在它上面总是安全的）。
const valueOnlyDescriptor = (value: unknown): PropertyDescriptor => {
  const descriptor = Native.objectCreate(null) as PropertyDescriptor;
  descriptor.value = value;
  return descriptor;
};

const trustedDataDescriptor = (value: unknown): PropertyDescriptor => {
  const descriptor = Native.objectCreate(null) as PropertyDescriptor;
  descriptor.configurable = true;
  descriptor.enumerable = true;
  descriptor.writable = true;
  descriptor.value = value;
  return descriptor;
};

const installOwnDataProperty = (target: object, key: string, value: unknown, onBlocked: "throw" | "skip"): void => {
  const existing = nativeObjectGetOwnPropertyDescriptor(target, key);
  if (existing) {
    if ("value" in existing && existing.writable) {
      // 已有可写 own data property：只替换 value，保留其余 descriptor 标志（包括
      // non-configurable，这在 spec 里对"仅更新 value"始终允许）。
      Native.objectDefineProperty(target, key, valueOnlyDescriptor(value));
      return;
    }
    if (!existing.configurable) {
      if (onBlocked === "throw") {
        throw new TypeError(`installTrustedDataProperties: target property is not redefinable: "${key}"`);
      }
      return;
    }
    // existing.configurable === true 时（accessor 或不可写 data property 均可能），
    // 落到下面的分支，用普通 own data property 整体重新定义，替换掉原有的 accessor/属性。
  }
  Native.objectDefineProperty(target, key, trustedDataDescriptor(value));
};

/**
 * 把 source 的字符串 key 纯数据字段安装到内部可信 target 上（如早期脚本状态回填、
 * GM_Base 初始化）。target 上任何无法安全重定义的既有属性都会导致抛错，而不是静默跳过或
 * 调用其 setter——这些 target 被视为内部状态，出现这种情况说明契约已被破坏。
 */
export const installTrustedDataPropertiesStrict = (target: object, source: object): void => {
  const entries = readOwnStringKeyedDataProperties(source);
  for (let index = 0; index < entries.length; index += 1) {
    installOwnDataProperty(target, entries[index][0], entries[index][1], "throw");
  }
};

/**
 * 把 source 的字符串 key 纯数据字段刷新到暴露给脚本的信息对象上（如 GM_info）。
 * 脚本可能已经在这个对象的某个字段上安装了 non-configurable accessor 来"锁死"它——
 * 那是脚本对自己信息面的合法操作，这里会跳过该字段并继续刷新其余字段，绝不调用该 setter，
 * 也绝不让它阻断调用方后续的权威状态回填。
 */
export const refreshExposedDataProperties = (target: object, source: object): void => {
  const entries = readOwnStringKeyedDataProperties(source);
  for (let index = 0; index < entries.length; index += 1) {
    installOwnDataProperty(target, entries[index][0], entries[index][1], "skip");
  }
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
