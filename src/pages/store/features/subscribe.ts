import type { Subscribe } from "@App/app/repo/subscribe";
import { subscribeClient } from "./script";

// 订阅列表项：在 Subscribe 基础上附加 UI 临时状态（开关/操作 loading）
export type SubscribeLoading = Subscribe & {
  enableLoading?: boolean;
  actionLoading?: boolean;
};

export const fetchSubscribeList = async () => {
  return await subscribeClient.getAllSubscribe();
};

export const requestEnableSubscribe = async (param: { url: string; enable: boolean }) => {
  return await subscribeClient.enable(param.url, param.enable);
};

export const requestDeleteSubscribe = async (url: string) => {
  return await subscribeClient.delete(url);
};

export const requestCheckSubscribeUpdate = async (url: string) => {
  return await subscribeClient.checkUpdate(url);
};
