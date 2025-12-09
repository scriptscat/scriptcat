import { BgGMXhr } from "@App/pkg/utils/xhr/bg_gm_xhr";
import type { IGetSender, Group } from "@Packages/message/server";
import { mightPrepareSetClipboard, setClipboard } from "../service_worker/clipboard";

// nativePageXHR 不需要绑定 Offscreen.GMApi 的 this，外部可以直接引用
export const nativePageXHR = async (details: GMSend.XHRDetails, sender: IGetSender) => {
  const con = sender.getConnect(); // con can be undefined
  if (!con) throw new Error("offscreen xmlHttpRequest: Connection is undefined");
  const bgGmXhr = new BgGMXhr(details, { statusCode: 0, finalUrl: "", responseHeaders: "" }, con);
  bgGmXhr.do();
};

// nativePageWindowOpen 不需要绑定 Offscreen.GMApi 的 this，外部可以直接引用
export const nativePageWindowOpen = (details: { url: string }): boolean => {
  if (!details || !details.url) throw new Error("offscreen window.open: details.url is undefined");
  return !!window.open(details.url);
};

export const nativePageSetClipboard = ({ data, mimetype }: { data: string; mimetype: string }) => {
  setClipboard(data, mimetype);
};

export default class GMApi {
  constructor(private group: Group) {}

  init() {
    mightPrepareSetClipboard();
    this.group.on("xmlHttpRequest", nativePageXHR);
    this.group.on("windowOpen", nativePageWindowOpen);
    this.group.on("setClipboard", nativePageSetClipboard);
  }
}
