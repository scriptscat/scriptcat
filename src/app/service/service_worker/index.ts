import { Server } from "@Packages/message/server";
import { MessageQueue } from "@Packages/message/message_queue";
import { ScriptService } from "./script";
import { ResourceService } from "./resource";
import { ValueService } from "./value";
import { RuntimeService } from "./runtime";
import { ServiceWorkerMessageSend } from "@Packages/message/window_message";
import { PopupService } from "./popup";
import { SystemConfig } from "@App/pkg/config/config";
import { SynchronizeService } from "./synchronize";
import { SubscribeService } from "./subscribe";
import { ExtServer, ExtVersion } from "@App/app/const";
import { systemConfig } from "@App/pages/store/global";
import { ScriptCodeDAO, ScriptDAO } from "@App/app/repo/scripts";
import { SystemService } from "./system";

export type InstallSource = "user" | "system" | "sync" | "subscribe" | "vscode";

// service worker的管理器
export default class ServiceWorkerManager {
  constructor(
    private api: Server,
    private mq: MessageQueue,
    private sender: ServiceWorkerMessageSend
  ) {}

  async initManager() {
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
    const value = new ValueService(this.api.group("value"), this.sender, this.mq);
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
    const popup = new PopupService(this.api.group("popup"), this.mq, runtime, scriptDAO);
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
    // 8小时检查一次扩展更新
    chrome.alarms.create("checkUpdate", {
      delayInMinutes: 0,
      periodInMinutes: 8 * 60,
    });

    // 监听配置变化
    this.mq.subscribe("systemConfigChange", (msg) => {
      switch (msg.key) {
        case "cloud_sync": {
          synchronize.cloudSyncConfigChange(msg.value);
          break;
        }
      }
    });
    // 启动一次云同步
    systemConfig.getCloudSync().then((config) => {
      synchronize.cloudSyncConfigChange(config);
    });

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
  }

  checkUpdate() {
    fetch(`${ExtServer}api/v1/system/version?version=${ExtVersion}`)
      .then((resp) => resp.json())
      .then((resp: { data: { notice: string; version: string } }) => {
        systemConfig.getCheckUpdate().then((items) => {
          if (items.notice !== resp.data.notice) {
            systemConfig.setCheckUpdate(Object.assign(resp.data, { isRead: false }));
          } else {
            systemConfig.setCheckUpdate(Object.assign(resp.data, { isRead: items.isRead }));
          }
        });
      });
  }
}
