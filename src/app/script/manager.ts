/* eslint-disable max-classes-per-file */
import { fetchScriptInfo } from "@App/utils/script";
import ConnectCenter from "../connect/center";
import Manager from "../manager";
import { Script } from "../repo/scripts";

type Event = "install";

// 脚本管理器,负责脚本实际的安装、卸载、更新等操作
export class ScriptManager extends Manager {
  static instance = new ScriptManager(ConnectCenter.getInstance());

  static getInstance() {
    return ScriptManager.instance;
  }

  static ListenEventDecorator(event: Event) {
    return (target: any, propertyName: string) => {
      ScriptManager.getInstance().listenEvent(
        event,
        // @ts-ignore
        target.constructor
          .getInstance()
          [propertyName].bind(target.constructor.getInstance())
      );
    };
  }

  // eslint-disable-next-line class-methods-use-this
  public start() {
    ScriptManager.listenInstallRequest();
  }

  // 监听脚本安装/更新请求
  public static listenInstallRequest() {
    chrome.webRequest.onBeforeRequest.addListener(
      (req: chrome.webRequest.WebRequestBodyDetails) => {
        if (req.method !== "GET") {
          return {};
        }
        const hash = req.url.split("#").splice(1).join("#");
        if (hash.indexOf("bypass=true") !== -1) {
          return {};
        }
        ScriptManager.openInstallPage(req);
        // eslint-disable-next-line no-script-url
        return { redirectUrl: "javascript:void 0" };
      },
      {
        urls: [
          "*://*/*.user.js",
          "https://*/*.user.sub.js",
          "https://*/*.user.bg.js",
        ],
        types: ["main_frame"],
      },
      ["blocking"]
    );
  }

  public static openInstallPage(req: chrome.webRequest.WebRequestBodyDetails) {
    fetchScriptInfo(req.url)
      .then((info) => {
        chrome.tabs.create({
          url: `src/install.html?uuid=${info.uuid}`,
        });
      })
      .catch(() => {
        chrome.tabs.update(req.tabId, {
          url: `${req.url}#bypass=true`,
        });
      });
  }
}

// 事件监听处理
export class ScriptEvent {
  static instance = new ScriptEvent(ScriptManager.getInstance());

  manager: ScriptManager;

  constructor(manager: ScriptManager) {
    this.manager = manager;
  }

  static getInstance() {
    return ScriptEvent.instance;
  }

  @ScriptManager.ListenEventDecorator("install")
  public installHandler(script: Script) {
    return new Promise((resolve) => {
      console.log(script);
      console.log(this.manager);
      resolve({ test: 1 });
    });
  }
}

export default ScriptManager;
