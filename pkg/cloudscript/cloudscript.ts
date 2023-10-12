import IoC from "@App/app/ioc";
import { Script } from "@App/app/repo/scripts";
import { Value } from "@App/app/repo/value";
import ValueManager from "@App/app/service/value/manager";

export type ExportCookies = {
  [key: string]: any;
  domain?: string;
  url?: string;
  cookies?: chrome.cookies.Cookie[];
};

export type ExportParams = {
  [key: string]: any;
  exportValue: string;
  exportCookie: string;
  overwriteValue: boolean;
  overwriteCookie: boolean;
};

export default interface CloudScript {
  exportCloud(
    script: Script,
    values: Value[],
    cookies: ExportCookies[]
  ): Promise<void>;
}

function getCookies(
  detail: chrome.cookies.GetAllDetails
): Promise<chrome.cookies.Cookie[]> {
  return new Promise((resolve) => {
    chrome.cookies.getAll(detail, (cookies) => {
      resolve(cookies);
    });
  });
}

// 解析导出cookie表达式生成导出的cookie
export function parseExportCookie(
  exportCookie: string
): Promise<ExportCookies[]> {
  const lines = exportCookie.split("\n");
  const result = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const detail: ExportCookies = {};
    if (line.trim()) {
      line.split(";").forEach((param) => {
        const s = param.split("=");
        if (s.length !== 2) {
          return;
        }
        detail[s[0].trim()] = s[1].trim();
      });
      if (detail.url || detail.domain) {
        result.push(
          new Promise<ExportCookies>((resolve) => {
            getCookies(detail).then((cookies) => {
              detail.cookies = cookies;
              resolve(detail);
            });
          })
        );
      }
    }
  }
  return Promise.all(result);
}

// 解析value表达式生成导出的value
export async function parseExportValue(
  script: Script,
  exportValue: string
): Promise<Value[]> {
  const lines = exportValue.split("\n");
  const result = [];
  const valueManager = IoC.instance(ValueManager) as ValueManager;
  const values = await valueManager.getValues(script);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim()) {
      const s = line.split(",");
      for (let n = 0; n < s.length; n += 1) {
        const key = s[n].trim();
        if (key && values[key]) {
          result.push(values[key]);
        }
      }
    }
  }
  return result;
}
