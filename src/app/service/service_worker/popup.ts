import { type IMessageQueue } from "@Packages/message/message_queue";
import { type Group } from "@Packages/message/server";
import { type RuntimeService } from "./runtime";
import type { ScriptMenu, TPopupScript } from "./types";
import type { GetPopupDataReq, GetPopupDataRes, MenuClickParams } from "./client";
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
import { v5 as uuidv5 } from "uuid";
import { getCombinedMeta } from "./utils";

const enum ScriptMenuRegisterType {
  REGISTER = 1,
  UNREGISTER = 2,
}

// 以 tabId 为 key 的「执行次数」快取（字串形式存放），供 badge 显示使用。
const runCountMap = new Map<number, string>();

// 以 tabId 为 key 的「脚本数量」快取，供 badge 显示使用。
const scriptCountMap = new Map<number, string>();

// 已设定过 badge 的 tabId 集合；切换到「不显示数字」时用来清除既有 badge。
const badgeShownSet = new Set<number>();

// 用于 timeoutExecution 的唯一前缀 key（含随机片段），避免不同 tab 的排程互相覆盖。
const cIdKey = `(cid_${Math.random()})`;

// uuidv5 的命名空间：用来稳定生成 groupKey，将「相同性质」的 menu 合并显示。
const groupKeyNS = "43b9b9b1-75b7-4054-801c-1b0ad6b6b07b";

// --------------------------------------------------------------------------------------------------

// Chrome 限制：contextMenu 的 id 必须稳定不可频繁改变
// （例如：id-1 一次放在 index0，接著 removeAll 后又放到 index8，再 removeAll 又放到 index4）
// 推测是 Chrome 内部程式码没有预期到 menu id 大量增加/删除/跳跃
// 因此使用 chrome.contextMenus.create 建立新 id 的 menu item 时会发生冲突
// 如果 tab 切换，id 若跟随 script.uuid 变化，冲突更严重
// 会导致菜单项目可能无法正确显示
// 解法：整个浏览器共用一批固定的 uuidv4 作为 contextMenu 项目 id（不分 tab）

// SC 内部 id → Chrome 显示 id 的映射表（用于把 parentId/子项关联到稳定的显示 id）。
const contextMenuConvMap1 = new Map<string | number, string>();
// Chrome 显示 id → SC 内部 id 的反向映射表（用于点击事件回推原始 SC id）。
const contextMenuConvMap2 = new Map<string, string | number>();

// --------------------------------------------------------------------------------------------------

let lastActiveTabId = 0;

// --------------------------------------------------------------------------------------------------

// 串接中的更新承诺：序列化 genScriptMenu 执行，避免并行重建 contextMenu。
let contextMenuUpdatePromise = Promise.resolve();

// 处理popup页面的数据
export class PopupService {
  constructor(
    private group: Group,
    private mq: IMessageQueue,
    private runtime: RuntimeService,
    private scriptDAO: ScriptDAO,
    private systemConfig: SystemConfig
  ) {}

  // 将 ScriptMenu[] 转为 Chrome contextMenus.CreateProperties[]；同一 groupKey 仅保留一个实际显示项。
  genScriptMenuByTabMap(menuEntries: chrome.contextMenus.CreateProperties[], menu: ScriptMenu[]) {
    for (const { uuid, name, menus } of menu) {
      const subMenuEntries = [] as chrome.contextMenus.CreateProperties[];
      let withMenuItem = false;
      const groupKeys = new Map<string, { name: string; mSeparator?: boolean; nested?: boolean }>();
      for (const { name, options, groupKey } of menus) {
        if (options?.inputType) continue; // 如果是带输入框的菜单则不在页面内注册
        if (groupKeys.has(groupKey)) continue;
        groupKeys.set(groupKey, { name, mSeparator: options?.mSeparator, nested: options?.nested });
      }
      for (const [groupKey, { name, mSeparator, nested }] of groupKeys) {
        // 创建菜单
        const menuUid = `scriptMenu_menu_${uuid}_${groupKey}`;
        let createProperties;
        if (mSeparator) {
          createProperties = {
            id: menuUid,
            type: "separator",
            contexts: ["all"],
          } as chrome.contextMenus.CreateProperties;
        } else {
          createProperties = {
            id: menuUid,
            title: name,
            contexts: ["all"],
          } as chrome.contextMenus.CreateProperties;
          withMenuItem = true; // 表示实际菜单选项有。
        }
        if (nested) {
          createProperties.parentId = `scriptMenu_${uuid}`; // 上层是 `scriptMenu_${uuid}`
        } else {
          createProperties.parentId = `scriptMenu`;
        }
        subMenuEntries.push(createProperties);
      }
      if (withMenuItem) {
        // 创建脚本菜单
        menuEntries.push(
          {
            id: `scriptMenu_${uuid}`,
            title: name,
            contexts: ["all"],
            parentId: "scriptMenu",
          },
          ...subMenuEntries
        );
      }
    }
  }

  // 生成chrome菜单
  async genScriptMenu() {
    // 使用简单 Promise chain 避免同一个程序同时跑
    contextMenuUpdatePromise = contextMenuUpdatePromise
      .then(async () => {
        const tabId = lastActiveTabId;
        if (tabId === 0) return;
        const menuEntries = [] as chrome.contextMenus.CreateProperties[];
        const displayType = await this.systemConfig.getScriptMenuDisplayType();
        if (displayType === "all") {
          const [menu, backgroundMenu] = await Promise.all([this.getScriptMenu(tabId), this.getScriptMenu(-1)]);
          if (menu?.length) this.genScriptMenuByTabMap(menuEntries, menu);
          if (backgroundMenu?.length) this.genScriptMenuByTabMap(menuEntries, backgroundMenu); // 后台脚本的菜单
          if (menuEntries.length > 0) {
            // 创建根菜单
            // 若有子项才建立根节点「ScriptCat」，避免出现空的顶层菜单。
            menuEntries.unshift({
              id: "scriptMenu",
              title: "ScriptCat",
              contexts: ["all"],
            });
          }
        }

        // 移除之前所有的菜单
        await chrome.contextMenus.removeAll();
        contextMenuConvMap1.clear();
        contextMenuConvMap2.clear();

        let i = 0;
        for (const menuEntry of menuEntries) {
          // 菜单项目用的共通 uuid. 不会随 tab 切换或换页换iframe载入等行为改变。稳定id
          // 稳定显示 id：即使 removeAll 重建，显示 id 仍保持一致以规避 Chrome 的不稳定行为。
          const menuDisplayId = `${groupKeyNS}-${100000 + i}`;
          // 把 SC管理用id 换成 menu显示用id
          if (menuEntry.id) {
            // 建立 SC id ↔ 显示 id 的双向映射：parentId/点击回推都依赖此映射。
            contextMenuConvMap1.set(menuEntry.id!, menuDisplayId); // 用于parentId转换menuDisplayId
            contextMenuConvMap2.set(menuDisplayId, menuEntry.id!); // 用于menuDisplayId转换成SC管理用id
            menuEntry.id = menuDisplayId;
          }
          if (menuEntry.parentId) {
            menuEntry.parentId = contextMenuConvMap1.get(menuEntry.parentId) || menuEntry.parentId;
          }

          i++;
          // 由于使用旧id，旧的内部context menu item应会被重用因此不会造成记忆体失控。
          // （推论内部有cache机制，即使removeAll也是有残留）
          chrome.contextMenus.create(menuEntry, () => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              console.error("chrome.runtime.lastError in chrome.contextMenus.create:", lastError.message);
            }
          });
        }
      })
      .catch(console.warn);
  }

  // 防止并发导致频繁更新菜单，将注册菜单的请求集中在一个队列中处理
  updateMenuCommands = new Map<number, ((TScriptMenuRegister | TScriptMenuUnregister) & { registerType: number })[]>();

  // 此函数必须是同步执行的，避免updateMenuCommands并发问题
  updateMenuCommand(tabId: number, data: ScriptMenu[]): string[] {
    const retUpdated = new Set<string>();
    const list = this.updateMenuCommands.get(tabId);
    if (!list) return [];
    const uuids = new Set(list.map((entry) => entry.uuid));
    const scripts = new Map(data.filter((item) => uuids.has(item.uuid)).map((item) => [item.uuid, item]));
    for (const listEntry of list) {
      const message = listEntry as TScriptMenuRegister;
      // message.key是唯一的。 即使在同一tab里的mainframe subframe也是不一样
      const { uuid, key, name, options } = message;
      const script = scripts.get(uuid);
      if (!script) continue;
      const menus = script.menus;

      if (listEntry.registerType === ScriptMenuRegisterType.REGISTER) {
        retUpdated.add(uuid);
        // 以 options+name 生成稳定 groupKey：相同语义项目在 UI 只呈现一次，但可同时触发多个来源（frame）。
        // groupKey 用来表示「相同性质的项目」，允许重叠。
        // 例如 subframe 和 mainframe 创建了相同的 menu item，显示时只会出现一个。
        // 但点击后，两边都会执行。
        // 目的是整理显示，实际上内部还是存有多笔 entry（分别记录不同的 frameId 和 id）。
        const nameForKey = options.mSeparator ? "" : `${name}_${options.accessKey || ""}`;
        const popupGroup = options.inputType
          ? JSON.stringify({
              ...message.options,
              autoClose: undefined,
              id: undefined,
              name: nameForKey,
              nested: undefined,
              mSeparator: undefined,
            })
          : `${nameForKey}_${options.mIndividualKey}`; // 一般菜單項目不需要 JSON.stringify
        const groupKey = `${uuidv5(popupGroup, groupKeyNS)},${options.nested ? 3 : 2}`;
        const menu = menus.find((item) => item.key === key);
        if (!menu) {
          // 不存在新增
          menus.push({
            groupKey,
            key: key, // unique primary key
            name: name,
            options: message.options,
            tabId: tabId, // fix
            frameId: message.frameId, // fix with unique key
            documentId: message.documentId, // fix with unique key
          });
        } else {
          // 存在修改信息
          menu.name = message.name;
          menu.options = message.options;
          menu.groupKey = groupKey;
        }
      } else if (listEntry.registerType === ScriptMenuRegisterType.UNREGISTER) {
        // 删除菜单
        const index = menus.findIndex((item) => item.key === key);
        if (index >= 0) {
          retUpdated.add(uuid);
          menus.splice(index, 1);
        }
      }
    }
    list.length = 0;
    this.updateMenuCommands.delete(tabId);
    return [...retUpdated];
  }

  updateRegisterMenuCommand(
    message: TScriptMenuRegister | TScriptMenuUnregister,
    registerType: ScriptMenuRegisterType
  ): Promise<void> {
    const { tabId } = message;
    let list = this.updateMenuCommands.get(tabId);
    if (!list) {
      this.updateMenuCommands.set(tabId, (list = []));
    }
    list.push({ ...message, registerType });
    let retUpdated: string[] | undefined;
    return Promise.resolve(list) // 增加一个 await Promise.reslove() 转移微任务队列 再判断长度是否为0
      .then((list) => {
        if (!list.length) return;
        cacheInstance.tx(`${CACHE_KEY_TAB_SCRIPT}${tabId}`, (data: ScriptMenu[] | undefined, tx) => {
          if (!list.length) return;
          data = data || [];
          retUpdated = this.updateMenuCommand(tabId, data);
          if (retUpdated.length) {
            tx.set(data);
          }
        });
      })
      .then(() => {
        if (retUpdated?.length) {
          this.mq.publish<TPopupScript>("popupMenuRecordUpdated", { tabId, uuids: retUpdated });
          // 更新数据后再更新菜单
          this.updateScriptMenu(tabId);
        }
      });
  }

  registerMenuCommand(message: TScriptMenuRegister) {
    this.updateRegisterMenuCommand(message, ScriptMenuRegisterType.REGISTER);
  }

  unregisterMenuCommand({ key, uuid, tabId }: TScriptMenuUnregister) {
    this.updateRegisterMenuCommand({ key, uuid, tabId }, ScriptMenuRegisterType.UNREGISTER);
  }

  async updateScriptMenu(tabId: number) {
    if (tabId !== lastActiveTabId) return; // 其他页面的指令，不理

    // 注意：不要使用 getCurrentTab()。
    // 因为如果使用者切换到其他应用（如 Excel/Photoshop），网页仍可能触发 menu 的注册/解除操作。
    // 若此时用 getCurrentTab()，就无法正确更新右键选单。

    // 检查一下 tab的有效性
    // 仅针对目前 lastActiveTabId 进行检查与更新，避免误在非当前 tab 重建菜单。
    const tab = await chrome.tabs.get(lastActiveTabId);
    if (tab && !tab.frozen && tab.active && !tab.discarded && tab.lastAccessed) {
      // 更新菜单 / 生成菜单
      await this.genScriptMenu();
    }
  }

  // 将 Script 转为 ScriptMenu 并初始化其在该 tab 的菜单暂存（menus 空阵列、计数归零）。
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
    const { url, tabId } = req;
    const [matchingResult, runScripts, backScriptList] = await Promise.all([
      this.runtime.getPageScriptMatchingResultByUrl(url, true, true),
      this.getScriptMenu(tabId),
      this.getScriptMenu(-1),
    ]);

    const uuids = [...matchingResult.keys()];

    const scripts = await this.scriptDAO.gets(uuids);

    // 与运行时脚本进行合并
    // 以已运行脚本建立快取（uuid→ScriptMenu），供后续合并与覆盖状态。
    const runMap = new Map<string, ScriptMenu>(runScripts.map((script) => [script.uuid, script]));
    // 合并后结果
    const scriptMenuMap = new Map<string, ScriptMenu>();
    // 合并数据
    for (let idx = 0, l = uuids.length; idx < l; idx++) {
      const uuid = uuids[idx];
      const script = scripts[idx];
      const o = matchingResult.get(uuid);

      if (!script || !o) continue;

      let run = runMap.get(uuid);
      if (run) {
        // 如果脚本已经存在，则不添加，更新信息
        run.enable = script.status === SCRIPT_STATUS_ENABLE;
        run.isEffective = o.effective!;
        run.hasUserConfig = !!script.config;
      } else {
        if (script.selfMetadata) {
          script.metadata = getCombinedMeta(script.metadata, script.selfMetadata);
        }
        run = this.scriptToMenu(script);
        run.isEffective = o.effective!;
      }
      scriptMenuMap.set(uuid, run);
    }

    // 将未匹配当前 url 但仍在运行的脚本，附加到清单末端，避免使用者找不到其菜单。
    // 把运行了但是不在匹配中的脚本加入到菜单的最后 （因此 runMap 和 scriptMenuMap 分开成两个变数）
    for (const script of runScripts) {
      // 把运行了但是不在匹配中的脚本加入菜单
      if (!scriptMenuMap.has(script.uuid)) {
        scriptMenuMap.set(script.uuid, script);
      }
    }
    const scriptMenu = [...scriptMenuMap.values()];
    // 检查是否在黑名单中
    const isBlacklist = this.runtime.isUrlBlacklist(url);
    // 后台脚本只显示开启或者运行中的脚本
    return { isBlacklist, scriptList: scriptMenu, backScriptList };
  }

  async getScriptMenu(tabId: number): Promise<ScriptMenu[]> {
    const cacheKey = `${CACHE_KEY_TAB_SCRIPT}${tabId}`;
    return (await cacheInstance.get<ScriptMenu[]>(cacheKey)) || [];
  }

  async addScriptRunNumber({ tabId, frameId, scripts }: { tabId: number; frameId: number; scripts: Script[] }) {
    // 设置数据
    await cacheInstance.tx(`${CACHE_KEY_TAB_SCRIPT}${tabId}`, (data: ScriptMenu[] | undefined, tx) => {
      // 特例：frameId 为 0/未提供时，重置当前 tab 的计数资料（视为页面重新载入）。
      data = !frameId ? [] : data || [];
      // 设置脚本运行次数
      scripts.forEach((script) => {
        const scriptMenu = data.find((item) => item.uuid === script.uuid);
        if (scriptMenu) {
          // runNum：累计总执行次数；runNumByIframe：仅 iframe 执行次数（用于精细显示/统计）。
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
      tx.set(data);
    });
  }

  // 处理「非页面型（background）」脚本的安装/启用/删除/状态变更，并同步其菜单至 tabId = -1 的命名空间。
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
      await cacheInstance.tx(`${CACHE_KEY_TAB_SCRIPT}${-1}`, (menu: ScriptMenu[] | undefined, tx) => {
        menu = menu || [];
        const scriptMenu = menu.find((item) => item.uuid === script.uuid);
        // 加入菜单
        if (!scriptMenu) {
          const item = this.scriptToMenu(script);
          menu.push(item);
          tx.set(menu);
        }
      });
    });
    this.mq.subscribe<TEnableScript[]>("enableScripts", async (data) => {
      cacheInstance.tx(`${CACHE_KEY_TAB_SCRIPT}${-1}`, async (menu: ScriptMenu[] | undefined, tx) => {
        menu = menu || [];
        const uuids = data.map((item) => item.uuid);
        const scripts = await this.scriptDAO.gets(uuids);
        for (let i = 0, l = uuids.length; i < l; i++) {
          const uuid = uuids[i];
          const script = scripts[i];
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
              tx.set(menu);
            }
          } else {
            // 移出菜单
            if (index !== -1) {
              menu.splice(index, 1);
              tx.set(menu);
            }
          }
        }
      });
    });
    this.mq.subscribe<TDeleteScript[]>("deleteScripts", (data) => {
      cacheInstance.tx(`${CACHE_KEY_TAB_SCRIPT}${-1}`, (menu: ScriptMenu[] | undefined, tx) => {
        if (!menu) return;
        for (const { uuid } of data) {
          const index = menu.findIndex((item) => item.uuid === uuid);
          if (index !== -1) {
            menu.splice(index, 1);
            tx.set(menu);
          }
        }
      });
    });
    this.mq.subscribe<TScriptRunStatus>("scriptRunStatus", ({ uuid, runStatus }) => {
      cacheInstance.tx(`${CACHE_KEY_TAB_SCRIPT}${-1}`, (menu: ScriptMenu[] | undefined, tx) => {
        const scriptMenu = menu?.find((item) => item.uuid === uuid);
        if (scriptMenu) {
          scriptMenu.runStatus = runStatus;
          if (runStatus === SCRIPT_RUN_STATUS_RUNNING) {
            scriptMenu.runNum = 1;
          } else {
            scriptMenu.runNum = 0;
          }
          tx.set(menu!);
        }
      });
    });
  }

  // 触发目标 tab/frame 的「menuClick」事件；key 为菜单唯一键以定位对应 listener。
  async menuClick({ uuid, menus, inputValue }: MenuClickParams) {
    // 同名菜单，每一个iframe只触发一次
    console.log("menuClick", uuid, menus, inputValue);
    const pushed = new Set<string>();
    await Promise.allSettled(
      menus.map((menu) => {
        const key = `${menu.groupKey}_${menu.tabId}_${menu.frameId || 0}_${menu.documentId || ""}`;
        if (pushed.has(key)) return;
        pushed.add(key);
        // menuClick 事件不等待回应
        return this.runtime.emitEventToTab(
          {
            tabId: menu.tabId,
            frameId: menu.frameId || 0,
            documentId: menu.documentId || "",
          },
          {
            uuid,
            event: "menuClick",
            eventId: `${menu.key}`,
            data: inputValue,
          }
        );
      })
    );
  }

  async updateBadgeIcon() {
    // badge 显示数字的策略：
    // - script_count：显示脚本数
    // - run_count：显示执行次数
    // - 其他：不显示数字
    // 如果切换为「不显示数字」模式，需要清空已经显示过的 badge。
    const tabId = lastActiveTabId;
    if (!tabId) return;
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
    // 标记此 tab 的 badge 已设定，便于后续在「不显示」模式时进行清理。
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
      const list = this.updateMenuCommands.get(tabId);
      if (list) {
        // 避免 menuCommand 更新在 Tab 移除后触发
        list.length = 0;
        this.updateMenuCommands.delete(tabId);
      }
      // 清理数据tab关闭需要释放的数据
      cacheInstance.tx(`${CACHE_KEY_TAB_SCRIPT}${tabId}`, (scripts: ScriptMenu[] | undefined) => {
        if (scripts) {
          return Promise.all(
            scripts.map(({ uuid }) => {
              // 处理GM_saveTab关闭事件, 由于需要用到tab相关的脚本数据，所以需要在这里处理
              // 避免先删除了数据获取不到
              return cacheInstance.tx(`GM_getTab:${uuid}`, (tabData: { [key: number]: any } | undefined, tx) => {
                if (tabData) {
                  delete tabData[tabId];
                  tx.set(tabData);
                }
              });
            })
          );
        }
      });
    });
    // 监听页面切换加载菜单
    // 进程启动时可能尚未触发 onActivated：补一次初始化以建立当前 tab 的菜单与 badge。
    getCurrentTab().then((tab) => {
      // 处理载入时未触发 chrome.tabs.onActivated 的情况
      if (!lastActiveTabId && tab?.id) {
        lastActiveTabId = tab.id;
        this.genScriptMenu();
        this.updateBadgeIcon();
      }
    });
    chrome.tabs.onActivated.addListener((activeInfo) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.tabs.onActivated:", lastError);
        // 没有 tabId 资讯，无法加载菜单
        return;
      }
      lastActiveTabId = activeInfo.tabId;
      // 目前设计：subframe 和 mainframe 的 contextMenu 是共用的。
      // 换句话说，subframe 的右键菜单可以执行 mainframe 的选项，反之亦然。
      this.genScriptMenu();
      this.updateBadgeIcon();
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
      // 先以显示 id 逆向查回 SC 内部 id（防 Chrome 映射差异），再依 `scriptMenu_menu_${uuid}_${groupKey}` 解析来源。
      const id1 = info.menuItemId;
      const id2 = contextMenuConvMap2.get(`${id1}`) || id1;
      const id9 = id2;
      // scriptMenu_menu_${uuid}_${groupKey}`
      if (!`${id9}`.startsWith("scriptMenu_menu_")) return; // 不处理非 scriptMenu_menu_ 开首的
      const menuIds = `${id9}`.split("_");
      if (menuIds.length === 4) {
        const [, , uuid, groupKey] = menuIds;
        // 寻找menu信息
        const menu = await this.getScriptMenu(tab!.id!);
        let script = menu.find((item) => item.uuid === uuid);
        if (!script) {
          // 从后台脚本中寻找
          const backgroundMenu = await this.getScriptMenu(-1);
          script = backgroundMenu.find((item) => item.uuid === uuid);
        }
        if (script) {
          // 仅触发「非输入型」且 groupKey 相符的项目；同 groupKey 可能代表多个 frame 来源，一次性全部触发。
          const menuItems = script.menus.filter((item) => item.groupKey === groupKey && !item.options?.inputType);
          await this.menuClick({
            uuid: script.uuid,
            menus: menuItems,
          } as MenuClickParams);
          return;
        }
      }
    });

    // scriptCountMap.clear();
    // runCountMap.clear();

    // 监听运行次数
    // 监听页面载入事件以更新脚本执行计数；若为当前活动 tab，同步刷新 badge。
    this.mq.subscribe(
      "pageLoad",
      async ({ tabId, frameId, scripts }: { tabId: number; frameId: number; document: string; scripts: Script[] }) => {
        await this.addScriptRunNumber({ tabId, frameId, scripts });
        // 设置角标 (chrome.tabs.onActivated 切换后)
        if (tabId === lastActiveTabId) {
          await this.updateBadgeIcon();
        }
      }
    );
  }
}
