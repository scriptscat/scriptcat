import Hook, { HookHandler } from "@App/app/service/hook";

export default class MockTab {
  hook = new Hook<"create" | "remove">();

  create(
    createProperties: chrome.tabs.CreateProperties,
    callback?: (tab: chrome.tabs.Tab) => void
  ) {
    this.hook.dispatchHook("create", createProperties);
    callback?.({
      id: 1,
    } as chrome.tabs.Tab);
  }

  remove(tabId: number) {
    this.hook.dispatchHook("remove", tabId);
  }

  onRemoved = {
    addListener: (callback: HookHandler) => {
      this.hook.addHook("remove", callback);
    },
  };
}
