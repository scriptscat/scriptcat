import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import type { IGetSender, Group } from "@Packages/message/server";
import type { MessageConnect } from "@Packages/message/types";
import { bgXhrInterface } from "../service_worker/xhr_interface";

export default class GMApi {
  logger: Logger = LoggerCore.logger().with({ service: "gmApi" });

  constructor(private group: Group) {}

  async dealXhrResponse(
    con: MessageConnect | undefined,
    details: GMSend.XHRDetails,
    event: string,
    xhr: XMLHttpRequest,
    data?: any
  ) {
    if (!con) return;
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
        const xhrResponse = xhr.response;
        if (xhrResponse === null) {
          response.response = null;
        } else {
          let blob: Blob;
          if (xhrResponse instanceof ArrayBuffer) {
            blob = new Blob([xhrResponse]);
            response.response = URL.createObjectURL(blob);
          } else {
            blob = <Blob>xhrResponse;
            response.response = URL.createObjectURL(blob);
          }
          try {
            if (xhr.getResponseHeader("Content-Type")?.includes("text")) {
              // 如果是文本类型,则尝试转换为文本
              response.responseText = await blob.text();
            }
          } catch (e) {
            LoggerCore.logger(Logger.E(e)).error("GM XHR getResponseHeader error");
          }
          setTimeout(() => {
            URL.revokeObjectURL(<string>response.response);
          }, 60 * 1000);
        }
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

  async xmlHttpRequest(details: GMSend.XHRDetails, sender: IGetSender) {
    const con = sender.getConnect(); // con can be undefined
    if (!con) throw new Error("offscreen xmlHttpRequest: Connection is undefined");
    bgXhrInterface(details, { finalUrl: "", responseHeaders: "" }, con);
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
    this.group.on("setClipboard", this.setClipboard.bind(this));
  }
}
