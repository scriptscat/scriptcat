import { fetchScriptInfo } from "@App/utils/script";
import ConnectCenter from "../connect/center";
import Manager from "../manager";
import { Script } from "../repo/scripts";

// 脚本管理器,负责脚本实际的安装、卸载、更新等操作
export class ScriptManager extends Manager {
  // eslint-disable-next-line no-useless-constructor
  constructor(center: ConnectCenter) {
    super(center);
  }

  public start() {
    ScriptManager.listenInstallRequest();

    this.listenEvent("install", this.installHandler);
  }

  // 监听脚本安装/更新请求
  // eslint-disable-next-line class-methods-use-this
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

  public installHandler(script: Script) {
    console.log(script);
    console.log(this.center);
  }
}

export default ScriptManager;
