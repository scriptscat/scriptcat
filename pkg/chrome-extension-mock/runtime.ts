type Port = chrome.runtime.Port & {
  setTargetPort: (port: chrome.runtime.Port) => void;
  messageListener: Array<(message: any) => void>;
};

export default class Runtime {
  connectListener: Array<(port: chrome.runtime.Port) => void> = [];

  onConnect = {
    addListener: (callback: (port: chrome.runtime.Port) => void) => {
      this.connectListener.push(callback);
    },
  };

  Port(connectInfo?: chrome.runtime.ConnectInfo) {
    const messageListener: Array<(message: any) => void> = [];
    let targetPort: Port;
    return {
      setTargetPort(port: Port) {
        targetPort = port;
      },
      messageListener,
      name: connectInfo?.name || "",
      sender: {
        tab: {
          id: 1,
        } as unknown as chrome.tabs.Tab,
        url: window.location.href,
      },
      postMessage(message: any) {
        messageListener.forEach((callback) => {
          callback(message);
        });
      },
      onMessage: {
        addListener(callback: (message: any) => void) {
          targetPort.messageListener.push(callback);
        },
      } as unknown as chrome.events.Event<(message: any) => void>,
      onDisconnect: {
        addListener() {
          // do nothing
        },
      } as unknown as chrome.events.Event<() => void>,
    } as unknown as Port;
  }

  connect(connectInfo?: chrome.runtime.ConnectInfo) {
    const port = this.Port(connectInfo);
    const targetPort = this.Port(connectInfo);
    targetPort.setTargetPort(port);
    port.setTargetPort(targetPort);
    this.connectListener.forEach((callback) => {
      callback(targetPort);
    });
    return port;
  }

  getURL(path: string) {
    return `${window.location.href}${path}`;
  }
}
