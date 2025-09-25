import { type TMessageQueueGroup } from "@Packages/message/message_queue";
import { type Group } from "@Packages/message/server";
import type { ExtMessageSender } from "@Packages/message/types";
import { type RuntimeService } from "./runtime";
import type { TScriptMatchInfoEntry, ScriptMenu } from "./types";
import type { GetPopupDataReq, GetPopupDataRes } from "./client";
import { cacheInstance } from "@App/app/cache";
import type { Script, ScriptDAO } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL, SCRIPT_RUN_STATUS_RUNNING } from "@App/app/repo/scripts";
import type {
  TDeleteScript,
  TEnableScript,
  TInstallScript,
  TScriptMenuRegister,
  TScriptMenuUnregister,
  TScriptRunStatus,
} from "../queue";
import { getStorageName, getCurrentTab } from "@App/pkg/utils/utils";
import type { SystemConfig } from "@App/pkg/config/config";
import { CACHE_KEY_TAB_SCRIPT } from "@App/app/cache_key";
import { timeoutExecution } from "@App/pkg/utils/timer";

type TxUpdateScriptMenuCallback = (
  result: ScriptMenu[]
) => Promise<ScriptMenu[] | undefined> | ScriptMenu[] | undefined;

const runCountMap = new Map<number, string>();
const scriptCountMap = new Map<number, string>();
const badgeShownSet = new Set<number>();

const cIdKey = `(cid_${Math.random()})`;

// 处理popup页面的数据
export class PopupService {
  constructor(
    private group: Group,
    private mq: TMessageQueueGroup,
    private runtime: RuntimeService,
    private scriptDAO: ScriptDAO,
    private systemConfig: SystemConfig
  ) {}

  genScriptMenuByTabMap(menu: ScriptMenu[]) {
    let n = 0;
    for (const { uuid, name, menus } of menu) {
      // 如果是带输入框的菜单则不在页面内注册
      const nonInputMenus = menus.filter((item) => !item.options?.inputType);
      // 创建脚本菜单
      if (nonInputMenus.length) {
        n += nonInputMenus.length;
        chrome.contextMenus.create({
          id: `scriptMenu_${uuid}`,
          title: name,
          contexts: ["all"],
          parentId: "scriptMenu",
        });
        nonInputMenus.forEach((menu) => {
          // 创建菜单
          chrome.contextMenus.create({
            id: `scriptMenu_menu_${uuid}_${menu.id}`,
            title: menu.name,
            contexts: ["all"],
            parentId: `scriptMenu_${uuid}`,
          });
        });
      }
    }
    return n;
  }

  // 生成chrome菜单
  async genScriptMenu(tabId: number) {
    // 移除之前所有的菜单
    await chrome.contextMenus.removeAll();

    if ((await this.systemConfig.getScriptMenuDisplayType()) !== "all") {
      return;
    }

    const [menu, backgroundMenu] = await Promise.all([this.getScriptMenu(tabId), this.getScriptMenu(-1)]);
    if (!menu.length && !backgroundMenu.length) {
      return;
    }
    let n = 0;
    // 创建根菜单
    chrome.contextMenus.create({
      id: "scriptMenu",
      title: "ScriptCat",
      contexts: ["all"],
    });
    if (menu) {
      n += this.genScriptMenuByTabMap(menu);
    }
    // 后台脚本的菜单
    if (backgroundMenu) {
      n += this.genScriptMenuByTabMap(backgroundMenu);
    }
    if (n === 0) {
      // 如果没有菜单，删除菜单
      await chrome.contextMenus.remove("scriptMenu");
    }
  }

  async registerMenuCommand(message: TScriptMenuRegister) {
    // 给脚本添加菜单
    return this.txUpdateScriptMenu(message.tabId, async (data) => {
      const script = data.find((item) => item.uuid === message.uuid);
      if (script) {
        const menu = script.menus.find((item) => item.id === message.id);
        if (!menu) {
          script.menus.push({
            id: message.id,
            name: message.name,
            options: message.options,
            tabId: message.tabId,
            frameId: message.frameId,
            documentId: message.documentId,
          });
        } else {
          // 存在修改信息
          menu.name = message.name;
          menu.options = message.options;
        }
      }
      await this.updateScriptMenu();
      return data;
    });
  }

  async unregisterMenuCommand({ id, uuid, tabId }: TScriptMenuUnregister) {
    return this.txUpdateScriptMenu(tabId, async (data) => {
      // 删除脚本菜单
      const script = data.find((item) => item.uuid === uuid);
      if (script) {
        script.menus = script.menus.filter((item) => item.id !== id);
      }
      await this.updateScriptMenu();
      return data;
    });
  }

  async updateScriptMenu() {
    // 获取当前页面并更新菜单
    const tab = await getCurrentTab();
    // 生成菜单
    if (tab?.id) {
      await this.genScriptMenu(tab.id);
    }
  }

  scriptToMenu(script: Script): ScriptMenu {
    return {
      uuid: script.uuid,
      name: script.name,
      storageName: getStorageName(script),
      enable: script.status === SCRIPT_STATUS_ENABLE,
      updatetime: script.updatetime || 0,
      hasUserConfig: !!script.config,
      metadata: script.metadata,
      runStatus: script.runStatus,
      runNum: script.type === SCRIPT_TYPE_NORMAL ? 0 : script.runStatus === SCRIPT_RUN_STATUS_RUNNING ? 1 : 0,
      runNumByIframe: 0,
      menus: [],
      isEffective: null,
    };
  }

  // 获取popup页面数据
  async getPopupData(req: GetPopupDataReq): Promise<GetPopupDataRes> {
    const [matchingResult, runScripts, backScriptList] = await Promise.all([
      this.runtime.getPageScriptMatchingResultByUrl(req.url, true),
      this.getScriptMenu(req.tabId),
      this.getScriptMenu(-1),
    ]);
    // 与运行时脚本进行合并
    const runMap = new Map<string, ScriptMenu>(runScripts.map((script) => [script.uuid, script]));
    // 合并后结果
    const scriptMenuMap = new Map<string, ScriptMenu>();
    // 合并数据
    for (const [uuid, o] of matchingResult) {
      const script = o.matchInfo || ({} as TScriptMatchInfoEntry);
      let run = runMap.get(uuid);
      if (run) {
        // 如果脚本已经存在，则不添加，更新信息
        run.enable = script.status === SCRIPT_STATUS_ENABLE;
        run.isEffective = o.effective!;
        run.hasUserConfig = !!script.config;
      } else {
        run = this.scriptToMenu(script);
        run.isEffective = o.effective!;
      }
      scriptMenuMap.set(script.uuid, run);
    }
    // 把运行了但是不在匹配中的脚本加入到菜单的最后 （因此 runMap 和 scriptMenuMap 分开成两个变数）
    for (const script of runScripts) {
      // 把运行了但是不在匹配中的脚本加入菜单
      if (!scriptMenuMap.has(script.uuid)) {
        scriptMenuMap.set(script.uuid, script);
      }
    }
    const scriptMenu = [...scriptMenuMap.values()];
    // 检查是否在黑名单中
    const isBlacklist = this.runtime.isUrlBlacklist(req.url);
    // 后台脚本只显示开启或者运行中的脚本
    return { isBlacklist, scriptList: scriptMenu, backScriptList };
  }

  async getScriptMenu(tabId: number): Promise<ScriptMenu[]> {
    const cacheKey = `${CACHE_KEY_TAB_SCRIPT}${tabId}`;
    return (await cacheInstance.get<ScriptMenu[]>(cacheKey)) || [];
  }

  // 事务更新脚本菜单
  txUpdateScriptMenu(tabId: number, callback: TxUpdateScriptMenuCallback) {
    const cacheKey = `${CACHE_KEY_TAB_SCRIPT}${tabId}`;
    return cacheInstance.tx<ScriptMenu[]>(cacheKey, (menu) => callback(menu || []));
  }

  async addScriptRunNumber({ tabId, frameId, scripts }: { tabId: number; frameId: number; scripts: Script[] }) {
    // 设置数据
    return await this.txUpdateScriptMenu(tabId, async (data) => {
      if (!frameId) {
        data = [];
      }
      // 设置脚本运行次数
      scripts.forEach((script) => {
        const scriptMenu = data.find((item) => item.uuid === script.uuid);
        if (scriptMenu) {
          scriptMenu.runNum = (scriptMenu.runNum || 0) + 1;
          if (frameId) {
            scriptMenu.runNumByIframe = (scriptMenu.runNumByIframe || 0) + 1;
          }
        } else {
          const item = this.scriptToMenu(script);
          item.isEffective = true;
          item.runNum = 1;
          if (frameId) {
            item.runNumByIframe = 1;
          }
          data.push(item);
        }
      });
      let runCount = 0;
      for (const d of data) {
        runCount += d.runNum;
      }
      data.length && scriptCountMap.set(tabId, `${data.length}`);
      runCount && runCountMap.set(tabId, `${runCount}`);
      return data;
    });
  }

  dealBackgroundScriptInstall() {
    // 处理后台脚本
    this.mq.subscribe<TInstallScript>("installScript", async (data) => {
      const uuid = data.script.uuid;
      const script = await this.scriptDAO.get(uuid);
      if (!script) {
        return;
      }
      if (script.type === SCRIPT_TYPE_NORMAL) {
        return;
      }
      if (script.status !== SCRIPT_STATUS_ENABLE) {
        return;
      }
      return this.txUpdateScriptMenu(-1, (menu) => {
        const scriptMenu = menu.find((item) => item.uuid === script.uuid);
        // 加入菜单
        if (!scriptMenu) {
          const item = this.scriptToMenu(script);
          menu.push(item);
        }
        return menu;
      });
    });
    this.mq.subscribe<TEnableScript[]>("enableScripts", async (data): Promise<ScriptMenu[]> => {
      return this.txUpdateScriptMenu(-1, async (menu) => {
        for (const { uuid } of data) {
          const script = await this.scriptDAO.get(uuid);
          if (!script) {
            continue;
          }
          if (script.type === SCRIPT_TYPE_NORMAL) {
            continue;
          }
          const index = menu.findIndex((item) => item.uuid === uuid);
          if (script.status === SCRIPT_STATUS_ENABLE) {
            // 加入菜单
            if (index === -1) {
              const item = this.scriptToMenu(script);
              menu.push(item);
            }
          } else {
            // 移出菜单
            if (index !== -1) {
              menu.splice(index, 1);
            }
          }
        }
        return menu;
      });
    });
    this.mq.subscribe<TDeleteScript[]>("deleteScripts", (data): Promise<ScriptMenu[]> => {
      return this.txUpdateScriptMenu(-1, (menu) => {
        for (const { uuid } of data) {
          const index = menu.findIndex((item) => item.uuid === uuid);
          if (index !== -1) {
            menu.splice(index, 1);
          }
        }
        return menu;
      });
    });
    this.mq.subscribe<TScriptRunStatus>("scriptRunStatus", ({ uuid, runStatus }): Promise<ScriptMenu[]> => {
      return this.txUpdateScriptMenu(-1, (menu) => {
        const scriptMenu = menu.find((item) => item.uuid === uuid);
        if (scriptMenu) {
          scriptMenu.runStatus = runStatus;
          if (runStatus === SCRIPT_RUN_STATUS_RUNNING) {
            scriptMenu.runNum = 1;
          } else {
            scriptMenu.runNum = 0;
          }
        }
        return menu;
      });
    });
  }

  async menuClick({
    uuid,
    id,
    sender,
    inputValue,
  }: {
    uuid: string;
    id: number;
    sender: ExtMessageSender;
    inputValue?: any;
  }) {
    // 菜单点击事件
    await this.runtime.emitEventToTab(sender, {
      uuid,
      event: "menuClick",
      eventId: id.toString(),
      data: inputValue,
    });
    return true;
  }

  async updateBadgeIcon(tabId: number | undefined = -1) {
    if (tabId < 0) {
      const tab = await getCurrentTab();
      tabId = tab?.id;
    }
    if (typeof tabId !== "number") return;
    const badgeNumberType: string = await this.systemConfig.getBadgeNumberType();
    let map: Map<number, string> | undefined;
    if (badgeNumberType === "script_count") {
      map = scriptCountMap;
    } else if (badgeNumberType === "run_count") {
      map = runCountMap;
    } else {
      // 不显示数字
      if (badgeShownSet.has(tabId)) {
        badgeShownSet.delete(tabId);
        chrome.action.setBadgeText({
          text: "",
          tabId: tabId,
        });
      }
      return;
    }
    const text = map.get(tabId);
    if (typeof text !== "string") return;
    const backgroundColor = await this.systemConfig.getBadgeBackgroundColor();
    const textColor = await this.systemConfig.getBadgeTextColor();
    badgeShownSet.add(tabId);
    timeoutExecution(
      `${cIdKey}-tabId#${tabId}`,
      () => {
        if (!badgeShownSet.has(tabId)) return;
        chrome.action.setBadgeText({
          text: text || "",
          tabId: tabId,
        });
        chrome.action.setBadgeBackgroundColor({
          color: backgroundColor,
          tabId: tabId,
        });
        chrome.action.setBadgeTextColor({
          color: textColor,
          tabId: tabId,
        });
      },
      50
    );
  }

  init() {
    // 处理脚本菜单数据
    this.mq.subscribe<TScriptMenuRegister>("registerMenuCommand", this.registerMenuCommand.bind(this));
    this.mq.subscribe<TScriptMenuUnregister>("unregisterMenuCommand", this.unregisterMenuCommand.bind(this));
    this.group.on("getPopupData", this.getPopupData.bind(this));
    this.group.on("menuClick", this.menuClick.bind(this));
    this.dealBackgroundScriptInstall();

    // 监听tab开关
    chrome.tabs.onRemoved.addListener((tabId) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.tabs.onRemoved:", lastError);
        // 没有 tabId 资讯，无法释放数据
        return;
      }
      runCountMap.delete(tabId);
      scriptCountMap.delete(tabId);
      // 清理数据tab关闭需要释放的数据
      this.txUpdateScriptMenu(tabId, async (scripts) => {
        for (const { uuid } of scripts) {
          // 处理GM_saveTab关闭事件, 由于需要用到tab相关的脚本数据，所以需要在这里处理
          // 避免先删除了数据获取不到
          cacheInstance.tx(`GM_getTab:${uuid}`, (tabData?: { [key: number]: any }) => {
            if (tabData) {
              delete tabData[tabId];
            }
            return tabData;
          });
        }
        return undefined;
      });
    });
    // 监听页面切换加载菜单
    chrome.tabs.onActivated.addListener((activeInfo) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.tabs.onActivated:", lastError);
        // 没有 tabId 资讯，无法加载菜单
        return;
      }
      this.genScriptMenu(activeInfo.tabId);
      this.updateBadgeIcon(activeInfo.tabId);
    });
    // chrome.tabs.onUpdated.addListener((tabId, _changeInfo, _tab) => {
    //   const lastError = chrome.runtime.lastError;
    //   if (lastError) {
    //     console.error("chrome.runtime.lastError in chrome.tabs.onUpdated:", lastError);
    //     // 没有 tabId 资讯，无法加载菜单
    //     return;
    //   }
    //   this.updateBadgeIcon(tabId);
    // });
    // chrome.windows.onFocusChanged.addListener((_windowId) => {
    //   const lastError = chrome.runtime.lastError;
    //   if (lastError) {
    //     console.error("chrome.runtime.lastError in chrome.windows.onFocusChanged:", lastError);
    //     // 没有 tabId 资讯，无法加载菜单
    //     return;
    //   }
    //   this.updateBadgeIcon(-1);
    // });
    // 处理chrome菜单点击
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.contextMenus.onClicked:", lastError);
        // 出现错误不处理chrome菜单点击
        return;
      }
      const menuIds = `${info.menuItemId}`.split("_");
      if (menuIds.length === 4) {
        const [, , uuid, id] = menuIds;
        // 寻找menu信息
        const menu = await this.getScriptMenu(tab!.id!);
        let script = menu.find((item) => item.uuid === uuid);
        let bgscript = false;
        if (!script) {
          // 从后台脚本中寻找
          const backgroundMenu = await this.getScriptMenu(-1);
          script = backgroundMenu.find((item) => item.uuid === uuid);
          bgscript = true;
        }
        if (script) {
          const menuItem = script.menus.find((item) => item.id === parseInt(id, 10));
          if (menuItem) {
            await this.menuClick({
              uuid: script.uuid,
              id: menuItem.id,
              sender: {
                tabId: bgscript ? -1 : tab!.id!,
                frameId: menuItem.frameId || 0,
                documentId: menuItem.documentId || "",
              },
            });
            return;
          }
        }
      }
    });

    // scriptCountMap.clear();
    // runCountMap.clear();

    // 监听运行次数
    this.mq.subscribe(
      "pageLoad",
      async ({ tabId, frameId, scripts }: { tabId: number; frameId: number; document: string; scripts: Script[] }) => {
        await this.addScriptRunNumber({ tabId, frameId, scripts });
        // 设置角标
        await this.updateBadgeIcon(tabId);
      }
    );
  }
}
