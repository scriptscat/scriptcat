import { BgGMXhr } from "@App/pkg/utils/xhr/bg_gm_xhr";
import type { IGetSender, Group } from "@Packages/message/server";
import { mightPrepareSetClipboard, setClipboard } from "../service_worker/clipboard";

export default class GMApi {
  constructor(private group: Group) {}

  async xmlHttpRequest(details: GMSend.XHRDetails, sender: IGetSender) {
    const con = sender.getConnect(); // con can be undefined
    if (!con) throw new Error("offscreen xmlHttpRequest: Connection is undefined");
    const bgGmXhr = new BgGMXhr(details, { statusCode: 0, finalUrl: "", responseHeaders: "" }, con);
    bgGmXhr.do();
  }

  async setClipboard({ data, mimetype }: { data: string; mimetype: string }) {
    setClipboard(data, mimetype);
  }

  init() {
    mightPrepareSetClipboard();
    this.group.on("xmlHttpRequest", this.xmlHttpRequest.bind(this));
    this.group.on("setClipboard", this.setClipboard.bind(this));
  }
}
