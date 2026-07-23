import { DocumentationSite, ExtServer, ExtVersion } from "@App/app/const";
import { type Server } from "@Packages/message/server";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { ScriptService } from "./script";
import { ResourceService } from "./resource";
import { ValueService } from "./value";
import { RuntimeService } from "./runtime";
import { type IOffscreenSend } from "@Packages/message/types";
import { PopupService } from "./popup";
import { SystemConfig } from "@App/pkg/config/config";
import { SynchronizeService } from "./synchronize";
import { SubscribeService } from "./subscribe";
import { LogService } from "./log";
import { ScriptDAO } from "@App/app/repo/scripts";
import { SystemService } from "./system";
import { type Logger, LoggerDAO } from "@App/app/repo/logger";
import { initLocales, initLocalesPromise, localePath, t, watchLanguageChange } from "@App/locales/locales";
import { getCurrentTab, isFirefox } from "@App/pkg/utils/utils";
import { onTabRemoved, onUrlNavigated, setOnUserActionDomainChanged } from "./url_monitor";
import { LocalStorageDAO } from "@App/app/repo/localStorage";
import { FaviconDAO } from "@App/app/repo/favicon";
import { onRegularUpdateCheckAlarm } from "./regular_updatecheck";
import { InfoNotification, shouldAutoOpenChangelog } from "./utils";
import { AgentService } from "@App/app/service/agent/service_worker/agent";
import { extensionEnv, getExtensionUserAgentData } from "../extension/extension_env";
import { cleanupStaleTempStorageEntries } from "./temp";
import RuntimeLogger from "@App/app/logger/logger";
import LoggerCore from "@App/app/logger/core";
import { McpApprovalService } from "@App/app/service/service_worker/mcp/approval";
import { McpBridge, type McpWriteNotice } from "@App/app/service/service_worker/mcp/bridge";
import { McpController } from "@App/app/service/service_worker/mcp/controller";
import { McpUIService } from "@App/app/service/service_worker/mcp/service";
import { McpConnectClient } from "@App/app/service/offscreen/client";
import { hookFirefoxEventPageKeepAliveLoop, hookServiceWorkerKeepAliveLoop } from "../offscreen/keep_alive";

// "直接允许" 写策略下 MCP 无需人工确认即执行了写操作，发系统通知让用户知晓（决策 #12 的知情兜底）。
function notifyMcpWrite(notice: McpWriteNotice): void {
  const name = notice.name ?? "";
  const body =
    notice.kind === "install"
      ? t("mcp:allow_notify_install", { name })
      : notice.kind === "enable"
        ? t("mcp:allow_notify_enable", { name })
        : notice.kind === "disable"
          ? t("mcp:allow_notify_disable", { name })
          : notice.kind === "delete"
            ? t("mcp:allow_notify_delete", { name })
            : t("mcp:allow_notify_generic", { name });
  void InfoNotification(t("mcp:allow_notify_title"), body);
}

// service worker的管理器
export default class ServiceWorkerManager {
  private serviceLogger = LoggerCore.logger().with({ service: "service_worker" });

  constructor(
    private api: Server,
    private mq: IMessageQueue,
    private offscreenSend: IOffscreenSend
  ) {}

  logger(data: Logger) {
    // 发送日志消息
    const dao = new LoggerDAO();
    dao.save(data);
  }

  async getExtensionEnv(data: { requireUAD: boolean }) {
    const result = { ...extensionEnv };
    if (data.requireUAD) {
      result.userAgentData = await getExtensionUserAgentData();
    }
    return result;
  }

  initManager() {
    this.api.on("logger", this.logger.bind(this));
    this.api.on("getExtensionEnv", this.getExtensionEnv.bind(this));
    this.api.on("preparationOffscreen", async (data: { verified: boolean }) => {
      // 准备好环境
      await this.offscreenSend.init();
      this.mq.emit("preparationOffscreen", data);
    });
    this.offscreenSend.init();

    const faviconDAO = new FaviconDAO();

    const scriptDAO = new ScriptDAO();
    scriptDAO.enableCache();

    const localStorageDAO = new LocalStorageDAO();

    const systemConfig = new SystemConfig(this.mq);
    hookFirefoxEventPageKeepAliveLoop(systemConfig);

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
      this.offscreenSend,
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
      this.offscreenSend,
      this.api.group("synchronize"),
      script,
      value,
      resource,
      this.mq,
      systemConfig,
      scriptDAO
    );
    synchronize.init();
    const subscribe = new SubscribeService(this.api.group("subscribe"), this.mq, script);
    subscribe.init();
    const log = new LogService(this.api.group("log"), systemConfig);
    log.init();
    const system = new SystemService(
      systemConfig,
      this.api.group("system"),
      this.offscreenSend,
      this.mq,
      scriptDAO,
      faviconDAO
    );
    system.init();
    const agent = new AgentService(this.api.group("agent"), this.offscreenSend, resource);
    agent.init();

    const hasOffscreenDocument = typeof chrome.offscreen?.createDocument === "function";
    if (hasOffscreenDocument) {
      hookServiceWorkerKeepAliveLoop(systemConfig, this.mq, this.offscreenSend);
    }

    // 注入 AgentService 到 GMApi，使 Agent API 走权限验证通道
    const gmApi = runtime.getGMApi();
    if (gmApi) {
      gmApi.setAgentService(agent);
    }

    // MCP 桥接：运行期开关 mcp_enabled（由 McpController.initialize 内部监听），默认关闭，
    // 用户在设置里显式开启前不建立连接。Firefox 的 MV3 事件页生命周期未经验证/支持，显式排除。
    if (!isFirefox()) {
      const mcpApproval = new McpApprovalService(script, scriptDAO, script.scriptCodeDAO);
      const mcpBridge = new McpBridge(
        scriptDAO,
        script.scriptCodeDAO,
        mcpApproval,
        () => systemConfig.getMcpWritePolicy(),
        () => systemConfig.getMcpSourceReadPolicy(),
        notifyMcpWrite
      );
      const mcpController = new McpController(
        systemConfig,
        mcpBridge,
        this.mq,
        this.api.group("mcpConnect"),
        new McpConnectClient(this.offscreenSend)
      );
      // Deferred bridge.response for blocking ops (write approval / source disclosure): the decide
      // or bridge.cancel event resolves the persisted op and pushes the response back through the
      // controller's offscreen relay — never a Promise left hanging in the (suspendable) SW.
      mcpApproval.setResponder((requestId, response) => mcpController.sendBridgeResponse(requestId, response));
      mcpController.initialize();
      const mcpUIService = new McpUIService(this.api.group("mcp"), mcpController, mcpApproval, systemConfig);
      mcpUIService.init();
    }

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
            .catch((e) => this.serviceLogger.error("read extension update config failed", RuntimeLogger.E(e)));
        })
        .catch((e) => this.serviceLogger.error("check extension update failed", RuntimeLogger.E(e)));
    };

    this.mq.subscribe<any>("msgUpdatePageOpened", () => {
      pendingOpen = 0;
    });

    const initTime = Date.now();
    // 定时器处理
    chrome.alarms.onAlarm.addListener((alarm) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.alarms.onAlarm:", lastError);
        // 非预期的异常API错误，停止处理
      }
      const now = Date.now();
      const isJustInit = now - initTime < 30_000; // 浏览器刚开
      const isCarryoverAlarm = alarm.scheduledTime < initTime; // Alarm排程早于SW初始化
      const needsWarmupDelay = isJustInit || isCarryoverAlarm;
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
        case "agentTaskScheduler":
          agent.onSchedulerTick();
          break;
        case "cleanupTempStorage":
          // 避免浏览器打开时立即清除。先等tabs载入一下
          setTimeout(cleanupStaleTempStorageEntries, needsWarmupDelay ? 45_000 : 100);
          break;
        case "cleanupTrash":
          script.cleanupExpiredTrash();
          break;
        case "cleanupLogs":
          log
            .cleanupExpiredLogs()
            .catch((e) => this.serviceLogger.error("cleanup expired logs failed", RuntimeLogger.E(e)));
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

    // Agent 定时任务调度器 alarm（每分钟触发一次）
    chrome.alarms.get("agentTaskScheduler", (alarm) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.alarms.get:", lastError);
      }
      if (!alarm) {
        chrome.alarms.create(
          "agentTaskScheduler",
          {
            delayInMinutes: 1,
            periodInMinutes: 1,
          },
          () => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              console.error("chrome.runtime.lastError in chrome.alarms.create:", lastError);
            }
          }
        );
      }
    });

    // 云同步
    systemConfig.watch("cloud_sync", (value, previous) => {
      synchronize.cloudSyncConfigChange(value, previous);
    });

    // 定期清理过期的临时安装信息
    chrome.alarms.create("cleanupTempStorage", { periodInMinutes: 30 });

    // 定期清理回收站中过期的脚本(30 天精度无需更细)。
    // 必须先 get 再 create(同 checkUpdate/agentTaskScheduler):create 同名 alarm 会重置倒计时,
    // 活跃使用时 SW 频繁冷启动,无条件 create 会让 12 小时的闹钟永远数不满、清理永远不触发。
    chrome.alarms.get("cleanupTrash", (alarm) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.alarms.get:", lastError);
        // 非预期的异常API错误，停止处理
      }
      if (!alarm) {
        chrome.alarms.create("cleanupTrash", { periodInMinutes: 12 * 60 }, () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.alarms.create:", lastError);
            console.error("Chrome alarm is unable to create. Please check whether limit is reached.");
          }
        });
      }
    });

    // 定期清理超过保留天数的运行日志。先 get 再 create，避免 SW 冷启动重置倒计时。
    chrome.alarms.get("cleanupLogs", (alarm) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.alarms.get:", lastError);
      }
      if (!alarm) {
        chrome.alarms.create("cleanupLogs", { delayInMinutes: 1, periodInMinutes: 12 * 60 }, () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.alarms.create:", lastError);
            console.error("Chrome alarm is unable to create. Please check whether limit is reached.");
          }
        });
      }
    });

    if (process.env.NODE_ENV === "production") {
      chrome.runtime.onInstalled.addListener((details) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.runtime.onInstalled:", lastError);
          // chrome.runtime.onInstalled API出错不进行后续处理
        }
        initLocalesPromise.then(() => {
          if (details.reason === "install") {
            chrome.tabs.create({ url: `${DocumentationSite}${localePath}/docs/use/install_comple` });
          } else if (details.reason === "update") {
            const url = `${DocumentationSite}${localePath}/docs/change/${ExtVersion.includes("-") ? "beta-changelog/" : ""}#${ExtVersion}`;
            // 如果只是修复版本，只弹出通知不打开页面
            // beta版本还是每次都打开更新页面
            InfoNotification(
              t("popup:ext_update_notification"),
              t("popup:ext_update_notification_desc", { version: ExtVersion }),
              {
                url,
              }
            );
            if (shouldAutoOpenChangelog(ExtVersion)) {
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
                .catch((e) => this.serviceLogger.error("open extension changelog failed", { url }, RuntimeLogger.E(e)));
            }
          }
        });

        // 监听扩展卸载事件
        watchLanguageChange(() => {
          chrome.runtime.setUninstallURL(`${DocumentationSite}${localePath}/uninstall`, () => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              console.error("chrome.runtime.lastError in chrome.runtime.setUninstallURL:", lastError);
            }
          });
        });
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
              q: domain ? `autoclose=30&site=${domain}` : "autoclose=30",
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
