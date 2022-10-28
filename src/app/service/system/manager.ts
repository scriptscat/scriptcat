import IoC from "@App/app/ioc";
import { MessageHander } from "@App/app/message/message";
import { SystemConfig } from "@App/pkg/config/config";
import Manager from "../manager";

// value管理器,负责value等更新获取等操作
@IoC.Singleton(MessageHander, SystemConfig)
export class SystemManager extends Manager {
  systemConfig: SystemConfig;

  constructor(message: MessageHander, systemConfig: SystemConfig) {
    super(message);
    this.systemConfig = systemConfig;
  }

  init() {
    // 两小时检查一次更新
    const checkUpdate = () => {
      fetch(
        `${this.systemConfig.server}api/v1/system/version?version=${this.systemConfig.version}`
      )
        .then((resp) => resp.json())
        .then((resp: { data: { notice: string; version: string } }) => {
          chrome.storage.local.get(["notice"], (items) => {
            if (items.notice !== resp.data.notice) {
              chrome.storage.local.set({
                notice: resp.data.notice,
                setRead: false,
              });
            }
            chrome.storage.local.set({
              version: resp.data.version,
            });
          });
        });
    };
    checkUpdate();
    setInterval(() => {
      checkUpdate();
    }, 7200 * 1000);

    if (process.env.NODE_ENV === "production") {
      chrome.runtime.onInstalled.addListener((details) => {
        if (details.reason === "install") {
          chrome.tabs.create({ url: "https://docs.scriptcat.org/" });
        } else if (details.reason === "update") {
          chrome.tabs.create({
            url: "https://docs.scriptcat.org/docs/change/",
          });
        }
      });
    }
  }

  getNotice(): Promise<{ notice: string; isRead: boolean }> {
    return new Promise((resolve) => {
      chrome.storage.local.get(["notice", "isRead"], (items) => {
        resolve({
          notice: items.notice,
          isRead: items.isRead,
        });
      });
    });
  }

  setRead(isRead: boolean) {
    chrome.storage.local.set({ isRead });
  }

  getVersion(): Promise<string> {
    return new Promise((resolve) => {
      chrome.storage.local.get(["version"], (items) => {
        resolve(items.version);
      });
    });
  }
}

export default SystemManager;
