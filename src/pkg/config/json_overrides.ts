// JSON 配置项的「默认配置 + 用户差异」存储机制（#1517）
// storage 中只保存用户与默认配置不同的部分，读取时与最新默认配置合并，
// 这样升级扩展带来的默认配置变化能自动生效，同时保留用户改动（用户值优先）。

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 深度合并：defaults 打底，overrides 覆盖；仅递归普通对象，数组与标量整体替换
export function deepMerge(defaults: unknown, overrides: unknown): unknown {
  if (!isPlainObject(defaults) || !isPlainObject(overrides)) return overrides;
  const result: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = key in defaults ? deepMerge(defaults[key], value) : value;
  }
  return result;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    return keysA.length === Object.keys(b).length && keysA.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

// 计算稀疏差异：仅保留与 defaults 不同的部分，完全一致时返回 undefined
// 注意：value 中缺失的默认键不会被记录，语义为「恢复默认值」
export function deepDiff(value: unknown, defaults: unknown): unknown {
  if (deepEqual(value, defaults)) return undefined;
  if (!isPlainObject(value) || !isPlainObject(defaults)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (key in defaults) {
      const diff = deepDiff(val, defaults[key]);
      if (diff !== undefined) result[key] = diff;
    } else {
      result[key] = val;
    }
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

// 读取解码：将存储的用户差异合并到最新默认配置，返回完整配置字符串
export function mergeJsonConfig(defaultStr: string, storedStr: string): string {
  return JSON.stringify(deepMerge(JSON.parse(defaultStr), JSON.parse(storedStr)), null, 2);
}

// 写入编码：只保留与默认配置的差异；与默认配置完全一致时返回 undefined（清除存储）
export function diffJsonConfig(defaultStr: string, valueStr: string): string | undefined {
  const diff = deepDiff(JSON.parse(valueStr), JSON.parse(defaultStr));
  return diff === undefined ? undefined : JSON.stringify(diff);
}
