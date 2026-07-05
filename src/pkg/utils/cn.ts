import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// 合并 Tailwind 类名，自动去重冲突规则
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
