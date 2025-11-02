type Port = chrome.runtime.Port & {
  setTargetPort: (port: chrome.runtime.Port) => void;
  messageListener: Array<(message: any) => void>;
};

export default class Runtime {
  id = "kfjdomqetnlhbgxasrwzypcviueotmlr";
  connectListener: Array<(port: chrome.runtime.Port) => void> = [];

  messageListener: Array<(message: any) => void> = [];

  onConnect = {
    addListener: (callback: (port: chrome.runtime.Port) => void) => {
      this.connectListener.push(callback);
    },
  };

  onMessage = {
    addListener: (callback: (message: any) => void) => {
      this.messageListener.push(callback);
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

  sendMessage(message: any, callback?: (response: any) => void) {
    this.messageListener.forEach((listener) => {
      listener(message);
    });

    // Mock response based on message action
    let response: any = { success: true };
    if (message.action === "serviceWorker/popup/getPopupData") {
      response = {
        success: true,
        scriptList: [
          {
            id: 1,
            name: "Test Script 1",
            enable: 1,
            menus: [],
            runNum: 0,
            updatetime: Date.now(),
          },
          {
            id: 2,
            name: "Test Script 2",
            enable: 0,
            menus: [],
            runNum: 5,
            updatetime: Date.now() - 1000,
          },
        ],
        backScriptList: [],
        isBlacklist: false,
      };
    }

    if (callback) {
      callback(response);
    }
    return Promise.resolve(response);
  }

  openOptionsPage(callback?: () => void) {
    // Mock implementation - just call callback
    if (callback) {
      callback();
    }
    return Promise.resolve();
  }
}
