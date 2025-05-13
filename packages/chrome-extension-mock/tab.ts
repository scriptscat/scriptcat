import EventEmitter from "eventemitter3";

export default class MockTab {
  hook = new EventEmitter();

  query() {
    return new Promise((resolve) => {
      resolve([]);
    });
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

  onRemoved = {
    addListener: (callback: any) => {
      this.hook.addListener("remove", callback);
    },
  };
}
