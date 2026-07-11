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
    listeners: [] as {
      callback: (...args: any[]) => any;
      filter?: chrome.webRequest.RequestFilter;
      extraInfoSpec?: string[];
    }[],
    addListener: function (
      callback: (...args: any[]) => any,
      filter?: chrome.webRequest.RequestFilter,
      extraInfoSpec?: string[]
    ) {
      this.listeners.push({ callback, filter, extraInfoSpec });
      this.EE.addListener("onBeforeRequest", (params) => {
        callback(params);
      });
      // TODO
    },
    removeListener: function (callback: (...args: any[]) => any) {
      this.listeners = this.listeners.filter((listener) => listener.callback !== callback);
      this.EE.removeAllListeners("onBeforeRequest");
      for (const listener of this.listeners) {
        this.EE.addListener("onBeforeRequest", (params) => {
          listener.callback(params);
        });
      }
    },
    hasListener: function (callback: (...args: any[]) => any) {
      return this.listeners.some((listener) => listener.callback === callback);
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

  reset() {
    this.sendHeader = undefined;
    this.responseStarted = undefined;
    this.onBeforeRequest.counter = 0;
    this.onBeforeRequest.listeners = [];
    this.onBeforeRequest.EE.removeAllListeners();
  }
}
