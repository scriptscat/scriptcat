import { fetchScriptInfo } from "@App/utils/script";
import Runtime from "@App/runtime/background/runtime";
import Cache from "@App/app/cache";
import CacheKey from "@App/utils/cache_key";
import MessageCenter from "../../message/center";
import Manager from "../manager";
import { ScriptDAO } from "../../repo/scripts";
import ScriptEventListener from "./event";
import Hook from "../hook";

// 脚本管理器,负责脚本实际的安装、卸载、更新等操作
export class ScriptManager extends Manager {
  static hook = new Hook<"upsert" | "enable" | "disable" | "delete">();

  static instance: ScriptManager;

  static getInstance(): ScriptManager {
    return ScriptManager.instance;
  }

  event: ScriptEventListener;

  scriptDAO: ScriptDAO;

  runtime: Runtime;

  constructor(center: MessageCenter, runtime: Runtime) {
    super(center);
    if (!ScriptManager.instance) {
      ScriptManager.instance = this;
    }
    this.event = new ScriptEventListener(this, new ScriptDAO());
    this.scriptDAO = new ScriptDAO();
    this.runtime = runtime;
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
    fetchScriptInfo(req.url, "user")
      .then((info) => {
        Cache.getInstance().set(CacheKey.scriptInfo(info.uuid), info);
        setTimeout(() => {
          // 清理缓存
          Cache.getInstance().del(CacheKey.scriptInfo(info.uuid));
        }, 60 * 1000);
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

export default ScriptManager;
