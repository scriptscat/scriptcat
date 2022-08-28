import { fetchScriptInfo } from "@App/utils/script";
import Runtime from "@App/runtime/background/runtime";
import Cache from "@App/app/cache";
import ConnectCenter from "../../connect/center";
import Manager from "../manager";
import { SCRIPT_STATUS_ENABLE, ScriptDAO } from "../../repo/scripts";
import ScriptEventListener from "./event";

// 脚本管理器,负责脚本实际的安装、卸载、更新等操作
export class ScriptManager extends Manager {
  static instance: ScriptManager;

  static getInstance(): ScriptManager {
    return ScriptManager.instance;
  }

  event: ScriptEventListener;

  scriptDAO: ScriptDAO;

  runtime: Runtime;

  constructor(center: ConnectCenter, runtime: Runtime) {
    super(center);
    if (!ScriptManager.instance) {
      ScriptManager.instance = this;
    }
    this.event = new ScriptEventListener(this, new ScriptDAO());
    this.scriptDAO = new ScriptDAO();
    this.runtime = runtime;
  }

  public start() {
    ScriptManager.listenInstallRequest();
    // 启动开启的后台脚本
    this.scriptDAO.table
      .where({ status: SCRIPT_STATUS_ENABLE })
      .toArray((items) => {
        items.forEach((item) => {
          this.runtime.enable(item);
        });
      });
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
        Cache.getInstance().set(
          `script:info:${info.uuid}`,
          info,
          1000 * 60 * 60
        );
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
