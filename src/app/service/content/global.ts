// 避免在全局页面环境中，内置处理函数被篡改或重写
const unsupportedAPI = () => {
  throw "unsupportedAPI";
};

export const Native = {
  structuredClone: typeof structuredClone === "function" ? structuredClone : unsupportedAPI,
  jsonStringify: JSON.stringify.bind(JSON),
  jsonParse: JSON.parse.bind(JSON),
  objectCreate: Object.create.bind(Object),
  objectGetOwnPropertyDescriptors: Object.getOwnPropertyDescriptors.bind(Object),
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
