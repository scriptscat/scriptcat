import { DocumentationSite, ExtServer, ExtVersion } from "@App/app/const";
import { type Server } from "@Packages/message/server";
import { type MessageQueue } from "@Packages/message/message_queue";
import { ScriptService } from "./script";
import { ResourceService } from "./resource";
import { ValueService } from "./value";
import { RuntimeService } from "./runtime";
import { type ServiceWorkerMessageSend } from "@Packages/message/window_message";
import { PopupService } from "./popup";
import { SystemConfig } from "@App/pkg/config/config";
import { systemConfig } from "@App/pages/store/global";
import { SynchronizeService } from "./synchronize";
import { SubscribeService } from "./subscribe";
import { ScriptDAO } from "@App/app/repo/scripts";
import { SystemService } from "./system";
import { type Logger, LoggerDAO } from "@App/app/repo/logger";
import { localePath, t } from "@App/locales/locales";
import { getCurrentTab, InfoNotification } from "@App/pkg/utils/utils";

// service worker的管理器
export default class ServiceWorkerManager {
  constructor(
    private api: Server,
    private mq: MessageQueue,
    private sender: ServiceWorkerMessageSend
  ) {}

  logger(data: Logger) {
    // 发送日志消息
    const dao = new LoggerDAO();
    dao.save(data);
  }

  async initManager() {
    this.api.on("logger", this.logger.bind(this));
    this.api.on("preparationOffscreen", async () => {
      // 准备好环境
      await this.sender.init();
      this.mq.emit("preparationOffscreen", {});
    });
    this.sender.init();

    const scriptDAO = new ScriptDAO();
    scriptDAO.enableCache();

    const systemConfig = new SystemConfig(this.mq);

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
      scriptDAO
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

    // 定时器处理
    chrome.alarms.onAlarm.addListener((alarm) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.alarms.onAlarm:", lastError);
        // 非预期的异常API错误，停止处理
      }
      switch (alarm.name) {
        case "checkScriptUpdate":
          script.checkScriptUpdate();
          break;
        case "cloudSync":
          // 进行一次云同步
          systemConfig.getCloudSync().then((config) => {
            synchronize.buildFileSystem(config).then((fs) => {
              synchronize.syncOnce(config, fs);
            });
          });
          break;
        case "checkSubscribeUpdate":
          subscribe.checkSubscribeUpdate();
          break;
        case "checkUpdate":
          // 检查扩展更新
          this.checkUpdate();
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
    // 启动一次云同步
    systemConfig.getCloudSync().then((config) => {
      synchronize.cloudSyncConfigChange(config);
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
          const url = `${DocumentationSite}/docs/change/${ExtVersion.includes("-") ? "beta-changelog/" : ""}#${ExtVersion}`;
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
            .then((_createdTab) => {
              // 当新 Tab 成功建立时才执行
              InfoNotification(
                t("ext_update_notification"),
                t("ext_update_notification_desc", { version: ExtVersion })
              );
            })
            .catch((e) => {
              console.error(e);
            });
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
  }

  checkUpdate() {
    fetch(`${ExtServer}api/v1/system/version?version=${ExtVersion}`)
      .then((resp) => resp.json())
      .then((resp: { data: { notice: string; version: string } }) => {
        systemConfig
          .getCheckUpdate()
          .then((items) => {
            const isRead = items.notice !== resp.data.notice ? false : items.isRead;
            systemConfig.setCheckUpdate(Object.assign(resp.data, { isRead: isRead }));
          })
          .catch((e) => {
            console.error(e);
          });
      });
  }
}
