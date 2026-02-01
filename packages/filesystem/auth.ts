import { ExtServer, ExtServerApi } from "@App/app/const";
import { WarpTokenError } from "./error";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import { sleep } from "@App/pkg/utils/utils";
import type { FileSystemType } from "./factory";

export type NetDiskType = "baidu" | "onedrive" | "googledrive" | "dropbox";

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
  try {
    let isWindowClosed: any;
    const url = `${ExtServer}api/v1/auth/net-disk?netDiskType=${netDiskType}`;
    if (typeof chrome !== "undefined" && typeof chrome?.tabs?.create === "function") {
      const t = await chrome.tabs.create({
        url,
      });
      isWindowClosed = async () => {
        try {
          const tab = await chrome.tabs.get(t.id!);
          // 如果到了callback页面，调用关闭
          if (tab && tab.url?.includes("/auth/net-disk/callback")) {
            chrome.tabs.remove(t.id!);
          }
          return !tab || tab.id !== t.id;
        } catch {
          return true;
        }
      };
    } else {
      const loginWindow = window.open(url);
      if (!loginWindow) throw new Error("The window cannot be opened.");
      isWindowClosed = () => loginWindow.closed === true;
    }
    while (true) {
      await sleep(1000);
      if (await isWindowClosed()) break;
    }
  } catch (e) {
    console.error(e);
  }
}

export type Token = {
  accessToken: string;
  refreshToken: string;
  createtime: number;
};

export async function AuthVerify(netDiskType: NetDiskType, invalid?: boolean) {
  let token: Token | undefined = undefined;
  const localStorageDAO = new LocalStorageDAO();
  const key = `netdisk:token:${netDiskType}`;
  try {
    token = await localStorageDAO.getValue<Token>(key);
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
    await localStorageDAO.saveValue(key, token);
  }
  // token过期或者失效
  if (Date.now() >= token.createtime + 3600000 || invalid) {
    // 大于一小时刷新token
    try {
      const resp = await RefreshToken(netDiskType, token.refreshToken);
      if (resp.code !== 0) {
        await localStorageDAO.delete(key);
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
      await localStorageDAO.saveValue(key, token);
    } catch (_) {
      // 报错返回原token
      return token.accessToken;
    }
  } else {
    return token.accessToken;
  }
  return token.accessToken;
}

export const netDiskTypeMap: Partial<Record<FileSystemType, NetDiskType>> = {
  "baidu-netdsik": "baidu",
  onedrive: "onedrive",
  googledrive: "googledrive",
  dropbox: "dropbox",
};

export async function ClearNetDiskToken(netDiskType: NetDiskType) {
  const localStorageDAO = new LocalStorageDAO();
  const key = `netdisk:token:${netDiskType}`;
  try {
    await localStorageDAO.delete(key);
  } catch (error) {
    // ignore
    console.error("ClearNetDiskToken error:", error);
  }
}
