import EventEmitter from "eventemitter3";

export default class WebRequest {
  sendHeader?: (details: chrome.webRequest.OnSendHeadersDetails) => chrome.webRequest.BlockingResponse | void;
  responseStarted?: (details: chrome.webRequest.OnResponseStartedDetails) => void;

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

  onResponseStarted = {
    addListener: (callback: any) => {
      this.responseStarted = callback;
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
