// 因为这个包出过好几次问题, 从原仓库单独剥离出来使用
// copyright: https://github.com/lodash/lodash

export function has(object: any, key: any) {
  return object != null && Object.prototype.hasOwnProperty.call(object, key);
}
