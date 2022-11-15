/* eslint-disable import/prefer-default-export */
import Cache from "@App/app/cache";
import { ExtServer } from "@App/app/const";
import { api } from "@App/pkg/axios";

type NetDiskType = "baidu";

export function GetNetDiskToken(netDiskType: NetDiskType): Promise<{
  code: number;
  msg: string;
  data: { accessToken: string };
}> {
  return api
    .get(`/auth/net-disk/token?netDiskType=${netDiskType}`)
    .then((resp) => {
      return resp.data;
    });
}

export function NetDisk(netDiskType: NetDiskType) {
  return new Promise<void>((resolve) => {
    const loginWindow = window.open(
      `${ExtServer}api/v1/auth/net-disk?netDiskType=${netDiskType}`
    );
    const t = setInterval(() => {
      try {
        if (loginWindow!.closed) {
          clearInterval(t);
          resolve();
        }
      } catch (e) {
        clearInterval(t);
        resolve();
      }
    }, 1000);
  });
}

export async function AuthVerify(netDiskType: NetDiskType, refresh?: boolean) {
  if (!refresh) {
    const data = Cache.getInstance().get(`netDiskToken:${netDiskType}`);
    // 大于一小时进行刷新
    if (data && Date.now() - data.time < 3600000) {
      return Promise.resolve(data.data);
    }
  }
  // 调用API查看是否已经验证过,否则进行重定向
  let token = await GetNetDiskToken(netDiskType);
  if (token.code !== 0) {
    // 申请
    await NetDisk(netDiskType);
    token = await GetNetDiskToken(netDiskType);
  }
  if (token.code !== 0) {
    return Promise.reject(new Error(token.msg));
  }
  Cache.getInstance().set(`netDiskToken:${netDiskType}`, {
    data: token.data,
    time: Date.now(),
  });
  return Promise.resolve(token.data);
}
