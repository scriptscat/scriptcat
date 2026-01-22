import { DocumentationSite, ExtServer, ExtVersion } from "@App/app/const";
import { type Server } from "@Packages/message/server";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { ScriptService } from "./script";
import { ResourceService } from "./resource";
import { ValueService } from "./value";
import { RuntimeService } from "./runtime";
import { type ServiceWorkerMessageSend } from "@Packages/message/window_message";
import { PopupService } from "./popup";
import { SystemConfig } from "@App/pkg/config/config";
import { SynchronizeService } from "./synchronize";
import { SubscribeService } from "./subscribe";
import { ScriptDAO } from "@App/app/repo/scripts";
import { SystemService } from "./system";
import { type Logger, LoggerDAO } from "@App/app/repo/logger";
import { initLocales, localePath, t } from "@App/locales/locales";
import { getCurrentTab, InfoNotification } from "@App/pkg/utils/utils";
import { onTabRemoved, onUrlNavigated, setOnUserActionDomainChanged } from "./url_monitor";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import { onRegularUpdateCheckAlarm } from "./regular_updatecheck";
import { cacheInstance } from "@App/app/cache";

// service worker的管理器
export default class ServiceWorkerManager {
  constructor(
    private api: Server,
    private mq: IMessageQueue,
    private sender: ServiceWorkerMessageSend
  ) {}

  logger(data: Logger) {
    // 发送日志消息
    const dao = new LoggerDAO();
    dao.save(data);
  }

  initManager() {
    this.api.on("logger", this.logger.bind(this));
    this.api.on("preparationOffscreen", async () => {
      // 准备好环境
      await this.sender.init();
      this.mq.emit("preparationOffscreen", {});
    });
    this.sender.init();

    const scriptDAO = new ScriptDAO();
    scriptDAO.enableCache();

    const localStorageDAO = new LocalStorageDAO();

    const systemConfig = new SystemConfig(this.mq);

    initLocales(systemConfig);

    let pendingOpen = 0;
    let targetSites: string[] = [];

    const resource = new ResourceService(this.api.group("resource"), this.mq);
    resource.init();
    const value = new ValueService(this.api.group("value"), this.mq);
    const script = new ScriptService(systemConfig, this.api.group("script"), this.mq, value, resource, scriptDAO);
    script.init();
    const runtime = new RuntimeService(
      systemConfig,
      this.api.group("runtime"),
      this.sender,
      this.mq,
      value,
      script,
      resource,
      scriptDAO,
      localStorageDAO
    );
    runtime.init();
    const popup = new PopupService(this.api.group("popup"), this.mq, runtime, scriptDAO, systemConfig);
    popup.init();
    value.init(runtime, popup);
    const synchronize = new SynchronizeService(
      this.sender,
      this.api.group("synchronize"),
      script,
      value,
      resource,
      this.mq,
      systemConfig,
      scriptDAO
    );
    synchronize.init();
    const subscribe = new SubscribeService(systemConfig, this.api.group("subscribe"), this.mq, script);
    subscribe.init();
    const system = new SystemService(systemConfig, this.api.group("system"), this.sender);
    system.init();

    const regularScriptUpdateCheck = async () => {
      const res = await onRegularUpdateCheckAlarm(systemConfig, script, subscribe);
      if (!res?.ok) return;
      targetSites = res.targetSites;
      pendingOpen = res.checktime;
    };

    const regularExtensionUpdateCheck = () => {
      fetch(`${ExtServer}api/v1/system/version?version=${ExtVersion}`)
        .then((resp) => resp.json())
        .then((resp: { data: { [key: string]: any; notice: string; version: string } }) => {
          const data = resp.data;
          systemConfig
            .getCheckUpdate()
            .then((items) => {
              const isRead = items.notice !== data.notice ? false : items.isRead;
              systemConfig.setCheckUpdate({ ...data, isRead: isRead });
            })
            .catch((e) => console.error("regularExtensionUpdateCheck: Check Error", e));
        })
        .catch((e) => console.error("regularExtensionUpdateCheck: Network Error", e));
    };

    this.mq.subscribe<any>("msgUpdatePageOpened", () => {
      pendingOpen = 0;
    });

    // 定时器处理
    chrome.alarms.onAlarm.addListener((alarm) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.alarms.onAlarm:", lastError);
        // 非预期的异常API错误，停止处理
      }
      switch (alarm.name) {
        case "checkScriptUpdate":
          regularScriptUpdateCheck();
          break;
        case "cloudSync":
          // 进行一次云同步
          systemConfig.getCloudSync().then((config) => {
            synchronize.buildFileSystem(config).then((fs) => {
              synchronize.syncOnce(config, fs);
            });
          });
          break;
        case "checkUpdate":
          // 检查扩展更新
          regularExtensionUpdateCheck();
          break;
      }
    });
    // 12小时检查一次扩展更新
    chrome.alarms.get("checkUpdate", (alarm) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.alarms.get:", lastError);
        // 非预期的异常API错误，停止处理
      }
      if (!alarm) {
        chrome.alarms.create(
          "checkUpdate",
          {
            delayInMinutes: 0,
            periodInMinutes: 12 * 60,
          },
          () => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              console.error("chrome.runtime.lastError in chrome.alarms.create:", lastError);
              // Starting in Chrome 117, the number of active alarms is limited to 500. Once this limit is reached, chrome.alarms.create() will fail.
              console.error("Chrome alarm is unable to create. Please check whether limit is reached.");
            }
          }
        );
      }
    });

    // 监听配置变化
    systemConfig.addListener("cloud_sync", (value) => {
      synchronize.cloudSyncConfigChange(value);
    });

    // 一些只需启动时运行一次的任务
    cacheInstance.getOrSet("extension_initialized", () => {
      // 启动一次云同步
      systemConfig.getCloudSync().then((config) => {
        synchronize.cloudSyncConfigChange(config);
      });
      return true;
    });

    if (process.env.NODE_ENV === "production") {
      chrome.runtime.onInstalled.addListener((details) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.runtime.onInstalled:", lastError);
          // chrome.runtime.onInstalled API出错不进行后续处理
        }
        if (details.reason === "install") {
          chrome.tabs.create({ url: `${DocumentationSite}${localePath}/docs/use/install_comple` });
        } else if (details.reason === "update") {
          const url = `${DocumentationSite}${localePath}/docs/change/${ExtVersion.includes("-") ? "beta-changelog/" : ""}#${ExtVersion}`;
          // 如果只是修复版本，只弹出通知不打开页面
          // beta版本还是每次都打开更新页面
          InfoNotification(t("ext_update_notification"), t("ext_update_notification_desc", { version: ExtVersion }));
          if (ExtVersion.endsWith(".0")) {
            getCurrentTab()
              .then((tab) => {
                // 检查是否正在播放视频，或者窗口未激活
                const openInBackground = !tab || tab.audible === true || !tab.active;
                // chrome.tabs.create 传回 Promise<chrome.tabs.Tab>
                return chrome.tabs.create({
                  url,
                  active: !openInBackground,
                  index: !tab ? undefined : tab.index + 1,
                  windowId: !tab ? undefined : tab.windowId,
                });
              })
              .catch((e) => {
                console.error(e);
              });
          }
        }
      });

      // 监听扩展卸载事件
      chrome.runtime.setUninstallURL(`${DocumentationSite}${localePath}/uninstall`, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.runtime.setUninstallURL:", lastError);
        }
      });
    }

    setOnUserActionDomainChanged(
      async (
        oldDomain: string,
        newDomain: string,
        _previousUrl: string | undefined,
        _navUrl: string,
        _tab: chrome.tabs.Tab
      ) => {
        // 已忽略后台换页
        // 在非私隐模式，正常Tab的操作下，用户的打开新Tab，或在当时Tab转至新网域时，会触发此function
        // 同一网域，SPA换页等不触发
        if (pendingOpen > 0 && targetSites.length > 0) {
          // 有更新，可弹出
          if (targetSites.includes(newDomain)) {
            // 只针对该网域的有效脚本发现「有更新」进行弹出
            // 如该网域没有任何有效脚本则忽略
            const domain = newDomain;
            const anyOpened = await script.openBatchUpdatePage({
              // https://github.com/scriptscat/scriptcat/issues/1087
              // 关于 autoclose，日后再检讨 UI/UX 设计
              q: domain ? `autoclose=30000&site=${domain}` : "autoclose=30000",
              dontCheckNow: true,
            });
            if (anyOpened) {
              pendingOpen = 0;
            }
          }
        }
      }
    );

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.tabs.onUpdated:", lastError);
        // 无视错误
      }
      // 只针对状态改变及URL推送；addListener 不使用FF专有的 filter 参数
      if (changeInfo.status === "loading" || changeInfo.status === "complete" || changeInfo.url) {
        onUrlNavigated(tab);
      }
    });

    chrome.tabs.onCreated.addListener((tab) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.tabs.onCreated:", lastError);
        // 无视错误
      }
      onUrlNavigated(tab);
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.tabs.onRemoved:", lastError);
        // 无视错误
      }
      onTabRemoved(tabId);
    });
  }
}
