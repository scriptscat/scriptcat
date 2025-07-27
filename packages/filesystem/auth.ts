import { ExtServer, ExtServerApi } from "@App/app/const";
import { WarpTokenError } from "./error";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import { sleep } from "@App/pkg/utils/utils";

type NetDiskType = "baidu" | "onedrive" | "googledrive";

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

export async function NetDisk(netDiskType: NetDiskType) {
  const newPageUrl = `${ExtServer}api/v1/auth/net-disk?netDiskType=${netDiskType}`;
  let isClosed: any;
  if (typeof chrome !== "undefined" && typeof chrome?.tabs?.create === "function") {
    const { id: tabId } = await chrome.tabs.create({ url: newPageUrl });
    isClosed = async () => {
      if (!tabId) return true;
      const ret = await chrome.tabs.get(tabId);
      return ret?.id !== tabId
    };
  } else if (typeof window !== "undefined" && typeof window?.open === "function") {
    const loginWindow = window.open(newPageUrl);
    isClosed = () => !loginWindow || loginWindow.closed;
  }
  while (true) {
    await sleep(1000);
    try {
      if (await isClosed()) {
        break;
      }
    } catch (_e) {
      break;
    }
  }
}

export type Token = {
  accessToken: string;
  refreshToken: string;
  createtime: number;
};

export async function AuthVerify(netDiskType: NetDiskType, invalid?: boolean) {
  let token: Token | undefined = undefined;
  const localStorageDao = new LocalStorageDAO();
  const key = `netdisk:token:${netDiskType}`;
  try {
    const resp = await localStorageDao.get(key);
    if (resp) {
      token = resp.value;
    }
  } catch (_) {
    // ignore
  }
  // token不存在,或者没有accessToken,重新获取
  if (!token || !token.accessToken) {
    // 强制重新获取token
    await NetDisk(netDiskType);
    const resp = await GetNetDiskToken(netDiskType);
    if (resp.code !== 0) {
      throw new WarpTokenError(new Error(resp.msg));
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
          return await AuthVerify(netDiskType);
        }
        throw new WarpTokenError(new Error(resp.msg));
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
    } catch (_) {
      // 报错返回原token
      return token.accessToken;
    }
  } else {
    return token.accessToken;
  }
  return token.accessToken;
}
