import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { isFirefox } from "@App/utils/utils";

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
      const preRequestHeaders: { [key: string]: string } = {};
      details.requestHeaders?.forEach((val) => {
        const lowerCase = val.name.toLowerCase();
        if (lowerCase.startsWith(`${headerFlag}-`)) {
          const headerKey = lowerCase.substring(0, headerFlag.length + 1);
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
              preRequestHeaders[headerKey] = val.value || "";
              break;
          }
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
              preRequestHeaders[lowerCase] =
                preRequestHeaders[lowerCase] || val.value || "";
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
        requestHeaders.push({
          name: key,
          value: preRequestHeaders[key],
        });
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
        return {};
      }
      details.responseHeaders?.forEach((val) => {
        if (responseHeaders[val.name]) {
          val.name = `${headerFlag}-${val.name}`;
        }
        // 处理最大重定向次数
        if (val.name.toLowerCase() === "location") {
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
    },
    { urls: ["<all_urls>"] }
  );
}

// 给xhr添加unsafeHeaders
export function setXhrUnsafeHeader(
  headerFlag: string,
  config: GMSend.XHRDetails,
  xhr: XMLHttpRequest
) {
  xhr.setRequestHeader(`${headerFlag}-gm-xhr`, "true");
  if (config.headers) {
    Object.keys(config.headers).forEach((key) => {
      if (
        unsafeHeaders[key] ||
        key.startsWith("sec-") ||
        key.startsWith("proxy-")
      ) {
        try {
          xhr.setRequestHeader(`${headerFlag}-${key}`, config.headers![key]!);
        } catch (e) {
          LoggerCore.getLogger(Logger.E(e)).error(
            "GM XHR setRequestHeader error"
          );
        }
      }
    });
  }
  if (config.maxRedirects !== undefined) {
    xhr.setRequestHeader(
      `${headerFlag}-max-redirects`,
      config.maxRedirects.toString()
    );
  }
  if (config.cookie) {
    xhr.setRequestHeader(`${headerFlag}-cookie`, config.cookie);
  }
  if (config.anonymous) {
    xhr.setRequestHeader(`${headerFlag}-anonymous`, "true");
  }
}

export async function dealXhr(
  headerFlag: string,
  config: GMSend.XHRDetails,
  xhr: XMLHttpRequest
): Promise<GMTypes.XHRResponse> {
  const removeXCat = new RegExp(`${headerFlag}-`, "g");
  const respond: GMTypes.XHRResponse = {
    finalUrl: xhr.responseURL || config.url,
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
        respond.responseText = xhr.responseText;
      } catch (e) {
        LoggerCore.getLogger(Logger.E(e)).error("GM XHR JSON parse error");
      }
    } else {
      try {
        respond.response = xhr.response;
        respond.responseText = xhr.responseText;
      } catch (e) {
        LoggerCore.getLogger(Logger.E(e)).error("GM XHR response error");
      }
    }
  }
  return Promise.resolve(respond);
}
