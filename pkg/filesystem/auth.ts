/* eslint-disable camelcase */
/* eslint-disable import/prefer-default-export */
import { ExtServer } from "@App/app/const";
import { api } from "@App/pkg/axios";

type NetDiskType = "baidu" | "onedrive";

export function GetNetDiskToken(netDiskType: NetDiskType): Promise<{
  code: number;
  msg: string;
  data: { token: { access_token: string; refresh_token: string } };
}> {
  return api
    .get(`/auth/net-disk/token?netDiskType=${netDiskType}`)
    .then((resp) => {
      return resp.data;
    });
}

export function RefreshToken(
  netDiskType: NetDiskType,
  refreshToken: string
): Promise<{
  code: number;
  msg: string;
  data: { token: { access_token: string; refresh_token: string } };
}> {
  return api
    .post(`/auth/net-disk/token/refresh?netDiskType=${netDiskType}`, {
      netDiskType,
      refreshToken,
    })
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

export type Token = {
  accessToken: string;
  refreshToken: string;
  createtime: number;
};

export async function AuthVerify(netDiskType: NetDiskType, reapply?: boolean) {
  let token: Token | undefined;
  try {
    token = JSON.parse(localStorage[`netdisk:token:${netDiskType}`]);
  } catch (e) {
    // ignore
  }
  if (reapply || !token || !token.accessToken) {
    // 强制重新获取token
    await NetDisk(netDiskType);
    const resp = await GetNetDiskToken(netDiskType);
    if (resp.code !== 0) {
      return Promise.reject(new Error(resp.msg));
    }
    token = {
      accessToken: resp.data.token.access_token,
      refreshToken: resp.data.token.refresh_token,
      createtime: Date.now(),
    };
    localStorage[`netdisk:token:${netDiskType}`] = JSON.stringify(token);
  }
  if (Date.now() >= token.createtime + 3600000) {
    // 大于一小时刷新token
    try {
      const resp = await RefreshToken(netDiskType, token.refreshToken);
      if (resp.code !== 0) {
        // 刷新失败删除token
        localStorage.removeItem(`netdisk:token:${netDiskType}`);
        return Promise.reject(new Error(resp.msg));
      }
      token = {
        accessToken: resp.data.token.access_token,
        refreshToken: resp.data.token.refresh_token,
        createtime: Date.now(),
      };
      localStorage[`netdisk:token:${netDiskType}`] = JSON.stringify(token);
    } catch (e) {
      // 报错返回原token
      return Promise.resolve(token.accessToken);
    }
  } else {
    return Promise.resolve(token.accessToken);
  }
  return Promise.resolve(token.accessToken);
}
