import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { GetSender, Group, MessageConnect } from "@Packages/message/server";

export default class GMApi {
  logger: Logger = LoggerCore.logger().with({ service: "gmApi" });

  constructor(private group: Group) {}

  async dealXhrResponse(
    con: MessageConnect,
    details: GMSend.XHRDetails,
    event: string,
    xhr: XMLHttpRequest,
    data?: any
  ) {
    const finalUrl = xhr.responseURL || details.url;
    let response: GMTypes.XHRResponse = {
      finalUrl,
      readyState: <any>xhr.readyState,
      status: xhr.status,
      statusText: xhr.statusText,
      // header由service_worker处理，但是存在特殊域名（例如：edge.microsoft.com）无法获取的情况，在这里增加一个默认值
      responseHeaders: xhr.getAllResponseHeaders(),
      responseType: details.responseType,
    };
    if (xhr.readyState === 4) {
      const responseType = details.responseType?.toLowerCase();
      if (responseType === "arraybuffer" || responseType === "blob") {
        let blob: Blob;
        if (xhr.response instanceof ArrayBuffer) {
          blob = new Blob([xhr.response]);
          response.response = URL.createObjectURL(blob);
        } else {
          blob = <Blob>xhr.response;
          response.response = URL.createObjectURL(blob);
        }
        try {
          if (xhr.getResponseHeader("Content-Type")?.indexOf("text") !== -1) {
            // 如果是文本类型,则尝试转换为文本
            response.responseText = await blob.text();
          }
        } catch (e) {
          LoggerCore.logger(Logger.E(e)).error("GM XHR getResponseHeader error");
        }
        setTimeout(() => {
          URL.revokeObjectURL(<string>response.response);
        }, 60 * 1000);
      } else if (response.responseType === "json") {
        try {
          response.response = JSON.parse(xhr.responseText);
        } catch (e) {
          LoggerCore.logger(Logger.E(e)).error("GM XHR JSON parse error");
        }
        try {
          response.responseText = xhr.responseText;
        } catch (e) {
          LoggerCore.logger(Logger.E(e)).error("GM XHR getResponseText error");
        }
      } else {
        try {
          response.response = xhr.response;
        } catch (e) {
          LoggerCore.logger(Logger.E(e)).error("GM XHR response error");
        }
        try {
          response.responseText = xhr.responseText || undefined;
        } catch (e) {
          LoggerCore.logger(Logger.E(e)).error("GM XHR getResponseText error");
        }
      }
    }
    if (data) {
      response = Object.assign(response, data);
    }
    con.sendMessage({
      action: event,
      data: response,
    });
    return response;
  }

  CAT_fetch(details: GMSend.XHRDetails, sender: GetSender) {
    throw new Error("Method not implemented.");
  }

  async xmlHttpRequest(details: GMSend.XHRDetails, sender: GetSender) {
    if (details.responseType === "stream") {
      // 只有fetch支持ReadableStream
      return this.CAT_fetch(details, sender);
    }
    const xhr = new XMLHttpRequest();
    const con = sender.getConnect();
    xhr.open(details.method || "GET", details.url, true, details.user || "", details.password || "");
    // 添加header
    if (details.headers) {
      for (const key in details.headers) {
        xhr.setRequestHeader(key, details.headers[key]);
      }
    }
    //超时时间
    if (details.timeout) {
      xhr.timeout = details.timeout;
    }
    if (details.overrideMimeType) {
      xhr.overrideMimeType(details.overrideMimeType);
    }
    //设置响应类型
    if (details.responseType !== "json") {
      xhr.responseType = details.responseType || "";
    }

    xhr.onload = () => {
      this.dealXhrResponse(con, details, "onload", xhr);
    };
    xhr.onloadstart = () => {
      this.dealXhrResponse(con!, details, "onloadstart", xhr);
    };
    xhr.onloadend = () => {
      this.dealXhrResponse(con!, details, "onloadend", xhr);
    };
    xhr.onabort = () => {
      this.dealXhrResponse(con!, details, "onabort", xhr);
    };
    xhr.onerror = () => {
      this.dealXhrResponse(con!, details, "onerror", xhr);
    };
    xhr.onprogress = (event) => {
      const respond: GMTypes.XHRProgress = {
        done: xhr.DONE,
        lengthComputable: event.lengthComputable,
        loaded: event.loaded,
        total: event.total,
        totalSize: event.total,
      };
      this.dealXhrResponse(con!, details, "onprogress", xhr, respond);
    };
    xhr.onreadystatechange = () => {
      this.dealXhrResponse(con!, details, "onreadystatechange", xhr);
    };
    xhr.ontimeout = () => {
      con?.sendMessage({ action: "ontimeout", data: {} });
    };
    //处理数据
    if (details.dataType === "FormData") {
      const data = new FormData();
      if (details.data && details.data instanceof Array) {
        await Promise.all(
          details.data.map(async (val: GMSend.XHRFormData) => {
            if (val.type === "file") {
              const file = new File([await (await fetch(val.val)).blob()], val.filename!);
              data.append(val.key, file, val.filename);
            } else {
              data.append(val.key, val.val);
            }
          })
        );
        xhr.send(data);
      }
    } else if (details.dataType === "Blob") {
      if (!details.data) {
        throw new Error("Blob data is empty");
      }
      const resp = await (await fetch(<string>details.data)).blob();
      xhr.send(resp);
    } else {
      xhr.send(<string>details.data);
    }

    con?.onDisconnect(() => {
      xhr.abort();
    });
  }

  openInTab({ url }: { url: string }) {
    return Promise.resolve(window.open(url) !== undefined);
  }

  textarea: HTMLTextAreaElement = document.createElement("textarea");

  clipboardData: { type?: string; data: string } | undefined;

  async setClipboard({ data, type }: { data: string; type: string }) {
    this.clipboardData = {
      type,
      data,
    };
    this.textarea.focus();
    document.execCommand("copy", false, <any>null);
  }

  init() {
    this.textarea.style.display = "none";
    document.documentElement.appendChild(this.textarea);
    document.addEventListener("copy", (e: ClipboardEvent) => {
      if (!this.clipboardData || !e.clipboardData) {
        return;
      }
      e.preventDefault();
      const { type, data } = this.clipboardData;
      e.clipboardData.setData(type || "text/plain", data);
      this.clipboardData = undefined;
    });

    this.group.on("xmlHttpRequest", this.xmlHttpRequest.bind(this));
    this.group.on("openInTab", this.openInTab.bind(this));
    this.group.on("setClipboard", this.setClipboard.bind(this));
  }
}
