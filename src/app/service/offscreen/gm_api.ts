import { BgGMXhr } from "@App/pkg/utils/xhr/bg_gm_xhr";
import type { IGetSender, Group } from "@Packages/message/server";

export default class GMApi {
  constructor(private group: Group) {}

  async xmlHttpRequest(details: GMSend.XHRDetails, sender: IGetSender) {
    const con = sender.getConnect(); // con can be undefined
    if (!con) throw new Error("offscreen xmlHttpRequest: Connection is undefined");
    const bgGmXhr = new BgGMXhr(details, { statusCode: 0, finalUrl: "", responseHeaders: "" }, con);
    bgGmXhr.do();
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
