import EventEmitter from "eventemitter3";

export default class WebRequest {
  sendHeader?: (details: chrome.webRequest.OnSendHeadersDetails) => chrome.webRequest.BlockingResponse | void;

  // mockXhr(xhr: any): any {
  //   return () => {
  //     const ret = new xhr();
  //     const header: chrome.webRequest.HttpHeader[] = [];
  //     ret.setRequestHeader = (k: string, v: string) => {
  //       header.push({
  //         name: k,
  //         value: v,
  //       });
  //     };
  //     const oldSend = ret.send.bind(ret);
  //     ret.send = (data: any) => {
  //       header.push({
  //         name: "cookie",
  //         value: "website=example.com",
  //       });
  //       const resp = this.sendHeader?.({
  //         method: ret.method,
  //         url: ret.url,
  //         requestHeaders: header,
  //         initiator: chrome.runtime.getURL(""),
  //       } as chrome.webRequest.OnSendHeadersDetails) as chrome.webRequest.BlockingResponse;
  //       resp.requestHeaders?.forEach((h) => {
  //         ret._authorRequestHeaders!.addHeader(h.name, h.value);
  //       });
  //       oldSend(data);
  //     };
  //     return ret;
  //   };
  // }

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

  onBeforeRequest = {
    counter: 0,
    EE: new EventEmitter<string, any>(),
    addListener: function (callback: (...args: any[]) => any) {
      this.EE.addListener("onBeforeRequest", (params) => {
        callback(params);
      });
      // TODO
    },
  };

  onBeforeRedirect = {
    addListener: () => {
      // TODO
    },
  };

  onErrorOccurred = {
    addListener: () => {
      // TODO
    },
  };
}
