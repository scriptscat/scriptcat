import dayjs from "dayjs";

// 为了发挥 ESM 的 Tree-Shaking 等功能，日后应转用 data-fns 之类的 ESM 库

export function semTime(time: Date) {
  return dayjs().to(dayjs(time));
}