import EventEmitter from "eventemitter3";

export default class MockTab {
  hook = new EventEmitter();

  query(queryInfo?: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) {
    const mockTab = {
      id: 1,
      url: "https://example.com",
      title: "Test Page",
      active: true,
      windowId: 1,
      index: 0,
      highlighted: false,
      incognito: false,
      pinned: false,
      status: "complete" as const,
      favIconUrl: "https://example.com/favicon.ico",
    } as chrome.tabs.Tab;

    if (callback) {
      callback([mockTab]);
    }
    return Promise.resolve([mockTab]);
  }

  create(createProperties: chrome.tabs.CreateProperties, callback?: (tab: chrome.tabs.Tab) => void) {
    this.hook.emit("create", createProperties);
    callback?.({
      id: 1,
    } as chrome.tabs.Tab);
  }

  remove(tabId: number) {
    this.hook.emit("remove", tabId);
  }

  sendMessage(
    tabId: number,
    message: any,
    options?: chrome.tabs.MessageSendOptions,
    callback?: (response: any) => void
  ) {
    this.hook.emit("sendMessage", tabId, message, options);
    if (callback) {
      callback({ success: true });
    }
    return Promise.resolve({ success: true });
  }

  onRemoved = {
    addListener: (callback: any) => {
      this.hook.addListener("remove", callback);
    },
  };
}
