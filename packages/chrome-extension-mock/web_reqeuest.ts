export default class WebRequest {
  sendHeader?: (
    details: chrome.webRequest.WebRequestHeadersDetails
  ) => chrome.webRequest.BlockingResponse | void;

  mockXhr(xhr: any): any {
    // eslint-disable-next-line no-underscore-dangle
    const _this = this;
    // eslint-disable-next-line func-names
    return function () {
      // eslint-disable-next-line new-cap
      const ret = new xhr();
      const header: chrome.webRequest.HttpHeader[] = [];
      ret.setRequestHeader = (k: string, v: string) => {
        header.push({
          name: k,
          value: v,
        });
      };
      const oldSend = ret.send.bind(ret);
      ret.send = (data: any) => {
        header.push({
          name: "cookie",
          value: "website=example.com",
        });
        const resp = _this.sendHeader?.({
          method: ret.method,
          url: ret.url,
          requestHeaders: header,
          initiator: chrome.runtime.getURL(""),
        } as chrome.webRequest.WebRequestHeadersDetails) as chrome.webRequest.BlockingResponse;
        resp.requestHeaders?.forEach((h) => {
          // eslint-disable-next-line no-underscore-dangle
          ret._authorRequestHeaders!.addHeader(h.name, h.value);
        });
        oldSend(data);
      };
      return ret;
    };
  }

  onBeforeSendHeaders = {
    addListener: (callback: any) => {
      this.sendHeader = callback;
    },
  };

  onHeadersReceived = {
    addListener: () => {
      // TODO
    },
  };

  onCompleted = {
    addListener: () => {
      // TODO
    },
  };
}
