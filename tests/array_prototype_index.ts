// Array.prototype 本身是数组：对它 defineProperty 一个数字下标会把 length 抬到 1，
// 之后即便删除该下标，length 也不会回落。isolate:false 的共享 worker 里，残留的 length 会让
// Array.prototype.concat(...) 等调用多出一个空洞（luxon 的 TokenParser 因此抛错）。
export const installArrayPrototypeIndexAccessor = (descriptor: PropertyDescriptor): (() => void) => {
  const previousDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, "0");
  const previousLength = Array.prototype.length;
  Object.defineProperty(Array.prototype, "0", { configurable: true, ...descriptor });
  return () => {
    if (previousDescriptor) Object.defineProperty(Array.prototype, "0", previousDescriptor);
    else Reflect.deleteProperty(Array.prototype, "0");
    Array.prototype.length = previousLength;
  };
};
