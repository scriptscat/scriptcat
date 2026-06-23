import type { CSSProperties } from "react";
import { toast as sonnerToast } from "sonner";

export type NotifyOpts = {
  description?: string;
  duration?: number;
  id?: string | number;
  action?: { label: string; onClick: () => void };
  style?: CSSProperties;
};

// 显示时长（ms）：常规反馈 ~3s，错误略长便于阅读，带动作的略长以留操作时间，loading 直到 resolve。
const DURATION = { success: 3000, info: 3000, warning: 3000, error: 4000, action: 5000 } as const;

function withDuration(base: number, opts?: NotifyOpts): NotifyOpts {
  const duration = opts?.duration ?? (opts?.action ? DURATION.action : base);
  // 把实际时长注入 --sc-toast-duration，驱动底部"距自动关闭剩余时间"进度条（样式见 src/index.css）。
  const style = { ...opts?.style, "--sc-toast-duration": `${duration}ms` } as CSSProperties;
  return { ...opts, duration, style };
}

type PromiseMsgs<T> = {
  loading: string;
  success: string | ((data: T) => string);
  error: string | ((err: unknown) => string);
};

export const notify = {
  success(title: string, opts?: NotifyOpts) {
    return sonnerToast.success(title, withDuration(DURATION.success, opts));
  },
  info(title: string, opts?: NotifyOpts) {
    return sonnerToast.info(title, withDuration(DURATION.info, opts));
  },
  warning(title: string, opts?: NotifyOpts) {
    return sonnerToast.warning(title, withDuration(DURATION.warning, opts));
  },
  error(title: string, opts?: NotifyOpts) {
    return sonnerToast.error(title, withDuration(DURATION.error, opts));
  },
  loading(title: string, opts?: NotifyOpts) {
    return sonnerToast.loading(title, { ...opts, duration: opts?.duration ?? Infinity });
  },
  promise<T>(promise: Promise<T>, msgs: PromiseMsgs<T>) {
    return sonnerToast.promise(promise, msgs);
  },
  dismiss(id?: string | number) {
    return sonnerToast.dismiss(id);
  },
};
