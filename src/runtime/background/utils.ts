import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { Channel } from "@App/app/message/channel";
import { SCRIPT_STATUS_ENABLE, Script } from "@App/app/repo/scripts";
import { isFirefox } from "@App/pkg/utils/utils";
import MessageCenter from "@App/app/message/center";
import IoC from "@App/app/ioc";
import { Request } from "./gm_api";
import Runtime from "./runtime";

export const unsafeHeaders: { [key: string]: boolean } = {
  // 部分浏览器中并未允许
  "user-agent": true,
  // 这两个是前缀
  "proxy-": true,
  "sec-": true,
  // cookie已经特殊处理
  cookie: true,
  "accept-charset": true,
  "accept-encoding": true,
  "access-control-request-headers": true,
  "access-control-request-method": true,
  connection: true,
  "content-length": true,
  date: true,
  dnt: true,
  expect: true,
  "feature-policy": true,
  host: true,
  "keep-alive": true,
  origin: true,
  referer: true,
  te: true,
  trailer: true,
  "transfer-encoding": true,
  upgrade: true,
  via: true,
};

export const responseHeaders: { [key: string]: boolean } = {
  "set-cookie": true,
};

export function isUnsafeHeaders(header: string) {
  return unsafeHeaders[header.toLocaleLowerCase()];
}

export function isExtensionRequest(
  details: chrome.webRequest.ResourceRequest & { originUrl?: string }
): boolean {
  return !!(
    (details.initiator &&
      chrome.runtime.getURL("").startsWith(details.initiator)) ||
    (details.originUrl &&
      details.originUrl.startsWith(chrome.runtime.getURL("")))
  );
}

// 监听web请求,处理unsafeHeaders
export function listenerWebRequest(headerFlag: string) {
  const reqOpt = ["blocking", "requestHeaders"];
  const respOpt = ["blocking", "responseHeaders"];
  if (!isFirefox()) {
    reqOpt.push("extraHeaders");
    respOpt.push("extraHeaders");
  }
  const maxRedirects = new Map<string, [number, number]>();
  const isRedirects = new Map<string, boolean>();
  // 处理发送请求的unsafeHeaders
  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      if (!isExtensionRequest(details)) {
        return {};
      }
      // 处理unsafeHeaders
      let cookie = "";
      let setCookie = "";
      let anonymous = false;
      let isGmXhr = false;
      const requestHeaders: chrome.webRequest.HttpHeader[] = [];
      const preRequestHeaders: { [key: string]: string | null } = {};
      details.requestHeaders?.forEach((val) => {
        const lowerCase = val.name.toLowerCase();
        if (lowerCase.startsWith(`${headerFlag}-`)) {
          const headerKey = lowerCase.substring(headerFlag.length + 1);
          // 处理unsafeHeaders
          switch (headerKey) {
            case "cookie":
              setCookie = val.value || "";
              break;
            case "max-redirects":
              maxRedirects.set(details.requestId, [
                0,
                parseInt(val.value || "", 10),
              ]);
              break;
            case "anonymous":
              anonymous = true;
              break;
            case "gm-xhr":
              isGmXhr = true;
              break;
            default:
              preRequestHeaders[headerKey] = val.value || null;
              break;
          }
          return;
        }
        // 原生header
        switch (lowerCase) {
          case "cookie":
            cookie = val.value || "";
            break;
          default:
            // 如果是unsafeHeaders,则判断是否已经有值,有值则不进行处理
            if (
              unsafeHeaders[lowerCase] ||
              lowerCase.startsWith("sec-") ||
              lowerCase.startsWith("proxy-")
            ) {
              // null表示不发送此header
              if (preRequestHeaders[lowerCase] !== null) {
                preRequestHeaders[lowerCase] =
                  preRequestHeaders[lowerCase] || val.value || "";
              }
            } else {
              requestHeaders.push(val);
            }
            break;
        }
      });
      // 不是由GM XHR发起的请求,不处理
      if (!isGmXhr) {
        return {};
      }
      // 匿名移除掉cookie
      if (anonymous) {
        cookie = "";
      }
      // 有设置cookie,则进行处理
      if (setCookie) {
        // 判断结尾是否有分号,没有则添加,然后进行拼接
        if (!cookie || cookie.endsWith(";")) {
          cookie += setCookie;
        } else {
          cookie += `;${setCookie}`;
        }
      }
      // 有cookie,则进行处理
      if (cookie) {
        requestHeaders.push({
          name: "Cookie",
          value: cookie,
        });
      }
      Object.keys(preRequestHeaders).forEach((key) => {
        // null表示不发送此header
        if (preRequestHeaders[key] !== null) {
          requestHeaders.push({
            name: key,
            value: preRequestHeaders[key]!,
          });
        }
      });
      return {
        requestHeaders,
      };
    },
    {
      urls: ["<all_urls>"],
    },
    reqOpt
  );
  // 处理无法读取的responseHeaders
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (!isExtensionRequest(details)) {
        // 判断是否为页面请求
        if (
          !(details.type === "main_frame" || details.type === "sub_frame") ||
          !isFirefox()
        ) {
          return {};
        }
        // 判断页面上是否有脚本会运行,如果有判断是否有csp,有则移除csp策略
        const runtime = IoC.instance(Runtime) as Runtime;
        // 这块代码与runtime里的pageLoad一样,考虑后面要不要优化
        const result = runtime.matchUrl(details.url, (script) => {
          // 如果是iframe,判断是否允许在iframe里运行
          if (details.type === "sub_frame") {
            if (script.metadata.noframes) {
              return true;
            }
            return script.status !== SCRIPT_STATUS_ENABLE;
          }
          return script.status !== SCRIPT_STATUS_ENABLE;
        });
        if (result.length > 0 && details.responseHeaders) {
          // 移除csp
          for (let i = 0; i < details.responseHeaders.length; i += 1) {
            if (
              details.responseHeaders[i].name.toLowerCase() ===
              "content-security-policy"
            ) {
              details.responseHeaders[i].value = "";
            }
          }
          return {
            responseHeaders: details.responseHeaders,
          };
        }
        return {};
      }
      const appendHeaders: chrome.webRequest.HttpHeader[] = [];
      details.responseHeaders?.forEach((val) => {
        const lowerCase = val.name.toLowerCase();
        if (responseHeaders[lowerCase]) {
          const copy = { ...val };
          copy.name = `${headerFlag}-${val.name}`;
          appendHeaders.push(copy);
        }
        // 处理最大重定向次数
        if (lowerCase === "location") {
          isRedirects.set(details.requestId, true);
          const nums = maxRedirects.get(details.requestId);
          if (nums) {
            nums[0] += 1;
            // 当前重定向次数大于最大重定向次数时,修改掉locatin,防止重定向
            if (nums[0] > nums[1]) {
              val.name = `${headerFlag}-${val.name}`;
            }
          }
        }
      });
      details.responseHeaders?.push(...appendHeaders);
      // 判断是否为重定向请求,如果是,将url注入到finalUrl
      if (isRedirects.has(details.requestId)) {
        details.responseHeaders?.push({
          name: `${headerFlag}-final-url`,
          value: details.url,
        });
      }
      return {
        responseHeaders: details.responseHeaders,
      };
    },
    {
      urls: ["<all_urls>"],
    },
    respOpt
  );
  chrome.webRequest.onCompleted.addListener(
    (details) => {
      if (!isExtensionRequest(details)) {
        return;
      }
      // 删除最大重定向数缓存
      maxRedirects.delete(details.requestId);
      isRedirects.delete(details.requestId);
    },
    { urls: ["<all_urls>"] }
  );
}

// 给xhr添加headers,包括unsafeHeaders
export function setXhrHeader(
  headerFlag: string,
  config: GMSend.XHRDetails,
  xhr: XMLHttpRequest
) {
  xhr.setRequestHeader(`${headerFlag}-gm-xhr`, "true");
  if (config.headers) {
    let hasOrigin = false;
    Object.keys(config.headers).forEach((key) => {
      const lowKey = key.toLowerCase();
      if (lowKey === "origin") {
        hasOrigin = true;
      }
      try {
        if (
          unsafeHeaders[lowKey] ||
          lowKey.startsWith("sec-") ||
          lowKey.startsWith("proxy-")
        ) {
          xhr.setRequestHeader(
            `${headerFlag}-${lowKey}`,
            config.headers![key]!
          );
        } else {
          // 直接设置header
          xhr.setRequestHeader(key, config.headers![key]!);
        }
      } catch (e) {
        LoggerCore.getLogger(Logger.E(e)).error(
          "GM XHR setRequestHeader error"
        );
      }
    });
    if (!hasOrigin) {
      xhr.setRequestHeader(`${headerFlag}-origin`, "");
    }
  }
  if (config.maxRedirects !== undefined) {
    xhr.setRequestHeader(
      `${headerFlag}-max-redirects`,
      config.maxRedirects.toString()
    );
  }
  if (config.cookie) {
    try {
      xhr.setRequestHeader(`${headerFlag}-cookie`, config.cookie);
    } catch (e) {
      LoggerCore.getLogger(Logger.E(e)).error(
        "GM XHR setRequestHeader cookie error"
      );
    }
  }
  if (config.anonymous) {
    xhr.setRequestHeader(`${headerFlag}-anonymous`, "true");
  }
}

export function getFetchHeader(
  headerFlag: string,
  config: GMSend.XHRDetails
): any {
  const headers: { [key: string]: string } = {};
  headers[`${headerFlag}-gm-xhr`] = "true";
  if (config.headers) {
    Object.keys(config.headers).forEach((key) => {
      const lowKey = key.toLowerCase();
      if (
        unsafeHeaders[lowKey] ||
        lowKey.startsWith("sec-") ||
        lowKey.startsWith("proxy-")
      ) {
        headers[`${headerFlag}-${lowKey}`] = config.headers![key]!;
      } else {
        // 直接设置header
        headers[key] = config.headers![key]!;
      }
    });
  }
  if (config.maxRedirects !== undefined) {
    headers[`${headerFlag}-max-redirects`] = config.maxRedirects.toString();
  }
  if (config.cookie) {
    headers[`${headerFlag}-cookie`] = config.cookie;
  }
  if (config.anonymous) {
    headers[`${headerFlag}-anonymous`] = "true";
  }
  return headers;
}

export async function dealXhr(
  headerFlag: string,
  config: GMSend.XHRDetails,
  xhr: XMLHttpRequest
): Promise<GMTypes.XHRResponse> {
  let finalUrl = xhr.responseURL || config.url;
  // 判断是否有headerFlag-final-url,有则替换finalUrl
  const finalUrlHeader = xhr.getResponseHeader(`${headerFlag}-final-url`);
  if (finalUrlHeader) {
    finalUrl = finalUrlHeader;
  }
  const removeXCat = new RegExp(`${headerFlag}-`, "g");
  const respond: GMTypes.XHRResponse = {
    finalUrl,
    readyState: <any>xhr.readyState,
    status: xhr.status,
    statusText: xhr.statusText,
    responseHeaders: xhr.getAllResponseHeaders().replace(removeXCat, ""),
    responseType: config.responseType,
  };
  if (xhr.readyState === 4) {
    if (
      config.responseType?.toLowerCase() === "arraybuffer" ||
      config.responseType?.toLowerCase() === "blob"
    ) {
      let blob: Blob;
      if (xhr.response instanceof ArrayBuffer) {
        blob = new Blob([xhr.response]);
        respond.response = URL.createObjectURL(blob);
      } else {
        blob = <Blob>xhr.response;
        respond.response = URL.createObjectURL(blob);
      }
      try {
        if (xhr.getResponseHeader("Content-Type")?.indexOf("text") !== -1) {
          // 如果是文本类型,则尝试转换为文本
          respond.responseText = await blob.text();
        }
      } catch (e) {
        LoggerCore.getLogger(Logger.E(e)).error(
          "GM XHR getResponseHeader error"
        );
      }
      setTimeout(() => {
        URL.revokeObjectURL(<string>respond.response);
      }, 60e3);
    } else if (config.responseType === "json") {
      try {
        respond.response = JSON.parse(xhr.responseText);
      } catch (e) {
        LoggerCore.getLogger(Logger.E(e)).error("GM XHR JSON parse error");
      }
      try {
        respond.responseText = xhr.responseText;
      } catch (e) {
        LoggerCore.getLogger(Logger.E(e)).error("GM XHR getResponseText error");
      }
    } else {
      try {
        respond.response = xhr.response;
      } catch (e) {
        LoggerCore.getLogger(Logger.E(e)).error("GM XHR response error");
      }
      try {
        respond.responseText = xhr.responseText || undefined;
      } catch (e) {
        LoggerCore.getLogger(Logger.E(e)).error("GM XHR getResponseText error");
      }
    }
  }
  return Promise.resolve(respond);
}

export function dealFetch(
  headerFlag: string,
  config: GMSend.XHRDetails,
  response: Response,
  readyState: 0 | 1 | 2 | 3 | 4
) {
  const removeXCat = new RegExp(`${headerFlag}-`, "g");
  let respHeader = "";
  response.headers &&
    response.headers.forEach((value, key) => {
      respHeader += `${key.replace(removeXCat, "")}: ${value}\n`;
    });
  const respond: GMTypes.XHRResponse = {
    finalUrl: response.url || config.url,
    readyState,
    status: response.status,
    statusText: response.statusText,
    responseHeaders: respHeader,
    responseType: config.responseType,
  };
  return respond;
}

export function getIcon(script: Script): string {
  return (
    (script.metadata.icon && script.metadata.icon[0]) ||
    (script.metadata.iconurl && script.metadata.iconurl[0]) ||
    (script.metadata.defaulticon && script.metadata.defaulticon[0]) ||
    (script.metadata.icon64 && script.metadata.icon64[0]) ||
    (script.metadata.icon64url && script.metadata.icon64url[0])
  );
}
function genScriptMenuByTabMap(
  tabMap: Map<number, { request: Request; channel: Channel }[]>
) {
  tabMap.forEach((menuArr, scriptId) => {
    // 创建脚本菜单
    chrome.contextMenus.create({
      id: `scriptMenu_${scriptId}`,
      title: menuArr[0].request.script.name,
      contexts: ["all"],
      parentId: "scriptMenu",
    });
    menuArr.forEach((menu) => {
      // 创建菜单
      chrome.contextMenus.create({
        id: `scriptMenu_menu_${scriptId}_${menu.request.params[0]}`,
        title: menu.request.params[1],
        contexts: ["all"],
        parentId: `scriptMenu_${scriptId}`,
        onclick: () => {
          (IoC.instance(MessageCenter) as MessageCenter).sendNative(
            {
              tag: menu.request.sender.targetTag,
              id: [
                menu.request.sender.frameId || menu.request.sender.tabId || 0,
              ],
            },
            {
              stream: menu.channel.flag,
              channel: true,
              data: "click",
            }
          );
        },
      });
    });
  });
}

// 生成chrome菜单
export function genScriptMenu(
  tabId: number | string,
  scriptMenu: Map<
    number | string,
    Map<
      number,
      {
        request: Request;
        channel: Channel;
      }[]
    >
  >
) {
  // 移除之前所有的菜单
  chrome.contextMenus.removeAll();
  const tabMap = scriptMenu.get(tabId);
  const backTabMap = scriptMenu.get("sandbox");
  if (!tabMap && !backTabMap) {
    return;
  }
  // 创建根菜单
  chrome.contextMenus.create({
    id: "scriptMenu",
    title: "ScriptCat",
    contexts: ["all"],
  });
  if (tabMap) {
    genScriptMenuByTabMap(tabMap);
  }
  // 后台脚本的菜单
  if (tabId !== "sandbox") {
    if (backTabMap) {
      genScriptMenuByTabMap(backTabMap);
    }
  }
}
