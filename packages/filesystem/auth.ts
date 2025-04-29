import { ExtServer, ExtServerApi } from "@App/app/const";
import { WarpTokenError } from "./error";
import { LocalStorageDAO } from "@App/app/repo/localStorage";

type NetDiskType = "baidu" | "onedrive";

export function GetNetDiskToken(netDiskType: NetDiskType): Promise<{
  code: number;
  msg: string;
  data: { token: { access_token: string; refresh_token: string } };
}> {
  return fetch(ExtServerApi + `auth/net-disk/token?netDiskType=${netDiskType}`).then((resp) => resp.json());
}

export function RefreshToken(
  netDiskType: NetDiskType,
  refreshToken: string
): Promise<{
  code: number;
  msg: string;
  data: { token: { access_token: string; refresh_token: string } };
}> {
  return fetch(ExtServerApi + `auth/net-disk/token/refresh?netDiskType=${netDiskType}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      netDiskType,
      refreshToken,
    }),
  }).then((resp) => resp.json());
}

export function NetDisk(netDiskType: NetDiskType) {
  return new Promise<void>((resolve) => {
    if (globalThis.window) {
      const loginWindow = window.open(`${ExtServer}api/v1/auth/net-disk?netDiskType=${netDiskType}`);
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
    } else {
      chrome.tabs
        .create({
          url: `${ExtServer}api/v1/auth/net-disk?netDiskType=${netDiskType}`,
        })
        .then(({ id: tabId }) => {
          const t = setInterval(async () => {
            try {
              const tab = await chrome.tabs.get(tabId!);
              console.log("query tab", tab);
              if (!tab) {
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
  });
}

export type Token = {
  accessToken: string;
  refreshToken: string;
  createtime: number;
};

export async function AuthVerify(netDiskType: NetDiskType, invalid?: boolean) {
  let token: Token | undefined;
  const localStorageDao = new LocalStorageDAO();
  const key = `netdisk:token:${netDiskType}`;
  try {
    token = await localStorageDao.get(key).then((resp) => {
      if (resp) {
        return resp.value;
      }
      return undefined;
    });
  } catch (e) {
    // ignore
  }
  // token不存在,或者没有accessToken,重新获取
  if (!token || !token.accessToken) {
    // 强制重新获取token
    await NetDisk(netDiskType);
    const resp = await GetNetDiskToken(netDiskType);
    if (resp.code !== 0) {
      return Promise.reject(new WarpTokenError(new Error(resp.msg)));
    }
    token = {
      accessToken: resp.data.token.access_token,
      refreshToken: resp.data.token.refresh_token,
      createtime: Date.now(),
    };
    invalid = false;
    await localStorageDao.save({
      key,
      value: token,
    });
  }
  // token过期或者失效
  if (Date.now() >= token.createtime + 3600000 || invalid) {
    // 大于一小时刷新token
    try {
      const resp = await RefreshToken(netDiskType, token.refreshToken);
      if (resp.code !== 0) {
        await localStorageDao.delete(key);
        // 刷新失败,并且标记失效,尝试重新获取token
        if (invalid) {
          return AuthVerify(netDiskType);
        }
        return Promise.reject(new WarpTokenError(new Error(resp.msg)));
      }
      token = {
        accessToken: resp.data.token.access_token,
        refreshToken: resp.data.token.refresh_token,
        createtime: Date.now(),
      };
      // 更新token
      await localStorageDao.save({
        key,
        value: token,
      });
    } catch (e) {
      // 报错返回原token
      return Promise.resolve(token.accessToken);
    }
  } else {
    return Promise.resolve(token.accessToken);
  }
  return Promise.resolve(token.accessToken);
}
