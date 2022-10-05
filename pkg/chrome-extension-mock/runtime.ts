export default class Runtime {
  connectListener: Array<(port: chrome.runtime.Port) => void> = [];

  onConnect = {
    addListener: (callback: (port: chrome.runtime.Port) => void) => {
      this.connectListener.push(callback);
    },
  };

  Port(connectInfo?: chrome.runtime.ConnectInfo): chrome.runtime.Port {
    const messageListener: Array<(message: any) => void> = [];
    return {
      name: connectInfo?.name || "",
      sender: {
        tab: {
          id: Math.random(),
        } as unknown as chrome.tabs.Tab,
        url: "http://example.com",
      },
      postMessage(message: any) {
        messageListener.forEach((callback) => {
          callback(message);
        });
      },
      onMessage: {
        addListener(callback: (message: any) => void) {
          messageListener.push(callback);
        },
      } as unknown as chrome.events.Event<(message: any) => void>,
      onDisconnect: {
        addListener() {
          // do nothing
        },
      } as unknown as chrome.events.Event<() => void>,
    } as unknown as chrome.runtime.Port;
  }

  connect(connectInfo?: chrome.runtime.ConnectInfo) {
    const port = this.Port(connectInfo);
    this.connectListener.forEach((callback) => {
      callback(port);
    });
    return port;
  }
}
