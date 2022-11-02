import { ExternalMessage, ExtVersion, Server } from "@App/app/const";
import IoC from "@App/app/ioc";
import { MessageHander } from "@App/app/message/message";
import { ScriptDAO } from "@App/app/repo/scripts";
import { SystemConfig } from "@App/pkg/config/config";
import semver from "semver";
import Manager from "../manager";

// value管理器,负责value等更新获取等操作
@IoC.Singleton(MessageHander, SystemConfig)
export class SystemManager extends Manager {
  systemConfig: SystemConfig;

  scriptDAO: ScriptDAO;

  constructor(message: MessageHander, systemConfig: SystemConfig) {
    super(message, "system");
    this.scriptDAO = new ScriptDAO();
    this.systemConfig = systemConfig;
  }

  init() {
    // 两小时检查一次更新
    const checkUpdate = () => {
      fetch(`${Server}api/v1/system/version?version=${ExtVersion}`)
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
          const version = semver.parse(ExtVersion);
          if (version && version.prerelease) {
            chrome.tabs.create({
              url: "https://docs.scriptcat.org/docs/change/",
            });
          } else {
            chrome.tabs.create({
              url: "https://docs.scriptcat.org/docs/change/pre-release",
            });
          }
        }
      });
    }
    // 处理pingpong
    this.message.setHandler("ping", () => {
      return Promise.resolve("pong");
    });
    // 处理外部网站调用
    this.message.setHandler(
      ExternalMessage,
      async (
        _action,
        {
          action,
          name,
          namespace,
        }: { action: string; name: string; namespace: string }
      ) => {
        if (action === "isInstalled") {
          const script = await this.scriptDAO.findByNameAndNamespace(
            name,
            namespace
          );
          if (script) {
            return Promise.resolve({
              installed: true,
              version: script.metadata.version && script.metadata.version[0],
            });
          }
          return Promise.resolve({ installed: false });
        }
        return Promise.resolve(false);
      }
    );
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
