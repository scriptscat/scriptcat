import { newMockXhr } from "mock-xmlhttprequest";
import type EventEmitter from "eventemitter3";
import type MockXhrRequest from "node_modules/mock-xmlhttprequest/dist/cjs/MockXhrRequest.d.cts";

export const setNetworkRequestCounter = (url: string) => {
  const wbr = chrome.webRequest.onBeforeRequest as any;
  const EE: EventEmitter | undefined = wbr?.EE;
  if (EE) {
    wbr.counter ||= 0;
    const counter = ++wbr.counter;
    EE.emit("onBeforeRequest", {
      tabId: -1,
      requestId: counter,
      url: url,
      initiator: `chrome-extension://${chrome.runtime.id}`,
      timeStamp: Date.now(),
    });
  }
};

// const realFetch = fetch;

export const mockNetwork = ({ onSend }: { onSend: (request: MockXhrRequest, ...args: any[]) => any }) => {
  const mockXhr = newMockXhr();
  const originalOnSend = onSend || mockXhr.onSend;
  mockXhr.onSend = function (request, ...args: any[]) {
    // @ts-ignore
    const ret = originalOnSend?.apply(this, [request, ...args]);
    setNetworkRequestCounter(request.url);
    return ret;
  };
  return { mockXhr };
};
