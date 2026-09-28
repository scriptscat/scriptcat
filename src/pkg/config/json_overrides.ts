const JSON_CONFIG_STORAGE_FORMAT = "scriptcat-json-overrides";
const JSON_CONFIG_STORAGE_VERSION = 1;

export type StoredJsonOverridesV1 = {
  format: typeof JSON_CONFIG_STORAGE_FORMAT;
  version: typeof JSON_CONFIG_STORAGE_VERSION;
  overrides: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function setOwn(value: Record<string, unknown>, key: string, next: unknown): void {
  Object.defineProperty(value, key, {
    configurable: true,
    enumerable: true,
    value: next,
    writable: true,
  });
}

// 深度合并：defaults 打底，overrides 覆盖；仅递归普通对象，数组与标量整体替换
export function deepMerge(defaults: unknown, overrides: unknown): unknown {
  if (!isPlainObject(defaults) || !isPlainObject(overrides)) return overrides;
  const result: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    setOwn(result, key, hasOwn(defaults, key) ? deepMerge(defaults[key], value) : value);
  }
  return result;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => deepEqual(value, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    return keysA.length === Object.keys(b).length && keysA.every((key) => hasOwn(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}

// 计算稀疏差异：仅保留与 defaults 不同的部分，完全一致时返回 undefined
export function deepDiff(value: unknown, defaults: unknown): unknown {
  if (deepEqual(value, defaults)) return undefined;
  if (!isPlainObject(value) || !isPlainObject(defaults)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (hasOwn(defaults, key)) {
      const diff = deepDiff(val, defaults[key]);
      if (diff !== undefined) setOwn(result, key, diff);
    } else {
      setOwn(result, key, val);
    }
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

function decodeStoredOverrides(stored: unknown): unknown {
  if (typeof stored === "string") return JSON.parse(stored);
  if (!isPlainObject(stored) || !hasOwn(stored, "format") || stored.format !== JSON_CONFIG_STORAGE_FORMAT) {
    throw new Error("Invalid JSON config storage envelope");
  }
  if (!hasOwn(stored, "version")) throw new Error("Invalid JSON config storage envelope");
  if (stored.version !== JSON_CONFIG_STORAGE_VERSION) {
    throw new Error(`Unsupported JSON config storage version: ${String(stored.version)}`);
  }
  if (!hasOwn(stored, "overrides")) throw new Error("Invalid JSON config storage envelope");
  return stored.overrides;
}

export function decodeJsonConfig(currentDefaultStr: string, stored: unknown): string {
  const currentDefault = JSON.parse(currentDefaultStr);
  const overrides = decodeStoredOverrides(stored);
  return JSON.stringify(deepMerge(currentDefault, overrides), null, 2);
}

export function encodeJsonConfig(currentDefaultStr: string, valueStr: string): StoredJsonOverridesV1 | undefined {
  const overrides = deepDiff(JSON.parse(valueStr), JSON.parse(currentDefaultStr));
  if (overrides === undefined) return undefined;
  return {
    format: JSON_CONFIG_STORAGE_FORMAT,
    version: JSON_CONFIG_STORAGE_VERSION,
    overrides,
  };
}
