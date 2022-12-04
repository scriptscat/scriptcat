import { ExternalMessage, ExtVersion, ExtServer } from "@App/app/const";
import IoC from "@App/app/ioc";
import { v5 as uuidv5 } from "uuid";
import { MessageHander } from "@App/app/message/message";
import { ScriptDAO } from "@App/app/repo/scripts";
import { SystemConfig } from "@App/pkg/config/config";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import Manager from "../manager";
import ScriptManager from "../script/manager";

// value管理器,负责value等更新获取等操作
@IoC.Singleton(MessageHander, SystemConfig)
export class SystemManager extends Manager {
  systemConfig: SystemConfig;

  scriptDAO: ScriptDAO;

  scriptManager: ScriptManager;

  wsVscode?: WebSocket;

  constructor(message: MessageHander, systemConfig: SystemConfig) {
    super(message, "system");
    this.scriptDAO = new ScriptDAO();
    this.systemConfig = systemConfig;
    this.scriptManager = IoC.instance(ScriptManager) as ScriptManager;
  }

  init() {
    // 两小时检查一次更新
    const checkUpdate = () => {
      fetch(`${ExtServer}api/v1/system/version?version=${ExtVersion}`)
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
            url: `https://docs.scriptcat.org/docs/change/#${ExtVersion}`,
          });
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
    this.listenEvent("connectVSCode", this.connectVSCode.bind(this));

    this.reconnectVSCode();
  }

  reconnectVSCode() {
    let connectVSCodeTimer: any;
    const handler = () => {
      if (!this.wsVscode) {
        this.connectVSCode();
      }
    };
    if (this.systemConfig.vscodeReconnect) {
      connectVSCodeTimer = setInterval(() => {
        handler();
      }, 30 * 1000);
    }

    SystemConfig.hook.addListener("update", (key, val) => {
      if (key === "vscodeReconnect") {
        if (val) {
          connectVSCodeTimer = setInterval(() => {
            handler();
          }, 30 * 1000);
        } else {
          clearInterval(connectVSCodeTimer);
        }
      }
    });
  }

  connectVSCode() {
    return new Promise<void>((resolve, reject) => {
      // 与vsc扩展建立连接
      if (this.wsVscode) {
        this.wsVscode.close();
      }
      try {
        this.wsVscode = new WebSocket(this.systemConfig.vscodeUrl);
      } catch (e: any) {
        reject(e);
        return;
      }
      this.wsVscode.addEventListener("open", () => {
        this.wsVscode!.send('{"action":"hello"}');
        resolve();
      });
      this.wsVscode.addEventListener("message", async (ev) => {
        const data = JSON.parse(ev.data);
        switch (data.action) {
          case "onchange": {
            const code = data.data.script;
            const script = await prepareScriptByCode(
              code,
              "",
              uuidv5(code.data.uri, uuidv5.URL)
            );
            this.scriptManager.event.upsertHandler(script, "vscode");
            break;
          }
          default:
        }
      });

      this.wsVscode.addEventListener("error", () => {
        reject(new Error("VSCode连接失败"));
        this.wsVscode = undefined;
      });
    });
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
