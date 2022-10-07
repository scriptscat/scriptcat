export default class MockTab {
  hooks: Map<string, Function> = new Map();

  hookCreate(callback: Function) {
    this.hooks.set("create", callback);
  }

  create(createProperties: chrome.tabs.CreateProperties) {
    this.hooks.get("create")?.(createProperties);
  }
}
