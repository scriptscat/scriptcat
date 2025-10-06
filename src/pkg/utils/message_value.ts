/**
 * 泛型类型：编码后的消息结构
 * @template T - 任意类型的原始数据
 * @property {T} m - 已编码的消息内容
 * @property {string} k - 用于标识编码批次的随机键
 */
export type TEncodedMessage<T> = { m: T; k: string };

/**
 * 将对象中的 undefined 和 null 特殊编码，确保可被安全序列化（例如用于 JSON 传输）
 * @template T
 * @param {T} values - 要编码的对象或数据
 * @returns {TEncodedMessage<T>} - 返回包含编码后数据与唯一键的对象
 */
export const encodeMessage = <T>(values: T): TEncodedMessage<T> => {
  // 生成唯一随机标识符，用于区分 null/undefined 占位
  const sRandomId = `##${Math.random()}${Math.random()}##`;
  const sUndefined = `${sRandomId}undefined`;
  const sNull = `${sRandomId}null`;

  /**
   * 递归编码函数
   * 将对象中的 undefined / null 转为唯一占位符字符串
   * @param {any} input - 任意输入值
   * @returns {any} - 编码后的值
   */
  const enc = (input: any): any => {
    // 内联优化：判断类型，提高性能
    if (input === undefined) return sUndefined;
    if (input === null) return sNull;
    if (typeof input !== "object") return input;

    // 数组递归处理
    if (Array.isArray(input)) {
      return input.map(enc);
    }

    // 普通对象递归处理
    const out: Record<string, any> = {};
    for (const k in input) {
      out[k] = enc(input[k]);
    }
    return out;
  };

  return { m: enc(values), k: sRandomId };
};

/**
 * 将 encodeMessage 生成的编码数据还原为原始对象
 * @template T
 * @param {TEncodedMessage<T>} values - 编码后的消息对象
 * @returns {T} - 还原后的原始数据
 * @throws {Error} 当输入无效或格式错误时抛出异常
 */
export const decodeMessage = <T>(values: TEncodedMessage<T>): T => {
  const { m, k } = values;
  if (m === null || m === undefined || !k || typeof k !== "string") throw new Error("invalid decodeMessage");

  const sRandomId = k;
  const sUndefined = `${sRandomId}undefined`;
  const sNull = `${sRandomId}null`;

  /**
   * 递归解码函数
   * 将占位符字符串还原为 undefined / null
   * @param {any} input - 任意输入值
   * @returns {any} - 解码后的值
   */
  const dec = (input: any): any => {
    if (input == sUndefined) return undefined;
    if (input === sNull) return null;
    if (typeof input !== "object") return input;

    // 数组递归处理
    if (Array.isArray(input)) {
      return input.map(dec);
    }

    // 对象递归处理
    const out: Record<string, any> = {};
    for (const k in input) {
      out[k] = dec(input[k]);
    }
    return out;
  };

  return dec(m);
};
