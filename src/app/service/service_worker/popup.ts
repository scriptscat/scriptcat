import { type IMessageQueue } from "@Packages/message/message_queue";
import { type Group } from "@Packages/message/server";
import { type RuntimeService } from "./runtime";
import type { TScriptMatchInfoEntry, ScriptMenu, ScriptMenuItem, TPopupScript } from "./types";
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
import { v5 as uuidv5, v4 as uuidv4 } from "uuid";

type TxUpdateScriptMenuCallback = (
  result: ScriptMenu[]
) => Promise<ScriptMenu[] | undefined> | ScriptMenu[] | undefined;

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

// 共用且稳定的 Chrome contextMenu 显示用 id 池（uuidv4 阵列），避免频繁新建 id 造成错乱。
const contextMenuConvArr = [] as string[];
// SC 内部 id → Chrome 显示 id 的映射表（用于把 parentId/子项关联到稳定的显示 id）。
const contextMenuConvMap1 = new Map<string | number, string>();
// Chrome 显示 id → SC 内部 id 的反向映射表（用于点击事件回推原始 SC id）。
const contextMenuConvMap2 = new Map<string, string | number>();

// --------------------------------------------------------------------------------------------------

let lastActiveTabId = 0;
let menuRegisterNeedUpdate = false;

// --------------------------------------------------------------------------------------------------

// menuRegister 用来保存「当前 Tab」的 menu 状态。
// 其中会包含 mainframe 和 subframe 的项目。
// 最后会再透过 groupKey 做整合显示。

// 每个 tab 的脚本菜单暂存；key 为 `${tabId}.${uuid}`，值为该脚本在该 tab 的菜单项（含 mainframe/subframe）。
const menuRegister = new Map<string, ScriptMenuItem[]>();

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
      const groupKeys = new Map<string, string>();
      for (const { name, options, groupKey } of menus) {
        if (options?.inputType) continue; // 如果是带输入框的菜单则不在页面内注册
        if (groupKeys.has(groupKey)) continue;
        groupKeys.set(groupKey, name);
      }
      for (const [groupKey, name] of groupKeys) {
        if (!name) continue; // 日后再调整 name 为空的情况
        // 创建菜单
        const menuUid = `scriptMenu_menu_${uuid}_${groupKey}`;
        const createProperties = {
          id: menuUid,
          title: name,
          contexts: ["all"],
          parentId: `scriptMenu_${uuid}`, // 上层是 `scriptMenu_${uuid}`
        } as chrome.contextMenus.CreateProperties;
        withMenuItem = true; // 日后或引入菜单分隔线的设计。 withMenuItem = true 表示实际菜单选项有。
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
          // 以固定槽位 i 对应稳定显示 id：即使 removeAll 重建，显示 id 仍保持一致以规避 Chrome 的不稳定行为。
          const menuDisplayId = contextMenuConvArr[i] || (contextMenuConvArr[i] = uuidv4());
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
          chrome.contextMenus.create(menuEntry);
        }
      })
      .catch(console.warn);
  }

  // 在多次本地记录操作后，只需要执行一次有锁记录更新。不用更新回传 false
  // 将「无锁的本地 menuRegister」同步回「有锁的快取」；若无实质变更则不发布更新事件。
  async syncMenuCommandsToSessionStore(tabId: number, uuid: string): Promise<boolean> {
    let retUpdated = false;
    await this.txUpdateScriptMenu(tabId, async (data) => {
      const script = data.find((item) => item.uuid === uuid);
      if (script && menuRegisterNeedUpdate) {
        menuRegisterNeedUpdate = false;
        retUpdated = true;
        // 本地纪录（最新）复制到外部存取（有锁）
        script.menus = [...(menuRegister.get(`${tabId}.${uuid}`) || [])];
      }
      return data;
    });
    if (retUpdated) {
      this.mq.publish<TPopupScript>("popupMenuRecordUpdated", { tabId, uuid });
    }
    return retUpdated;
  }

  // 标记需要同步后，若成功写回快取，再触发实际菜单重建（避免多次小变更重复重建）。
  async onMenuCommandsChanged(tabId: number, uuid: string) {
    menuRegisterNeedUpdate = true;
    const didTxRecordUpdate = await this.syncMenuCommandsToSessionStore(tabId, uuid);
    if (didTxRecordUpdate) {
      // 更新数据后再更新菜单
      await this.updateScriptMenu(tabId);
    }
  }

  async registerMenuCommand(message: TScriptMenuRegister) {
    // GM_registerMenuCommand 是同步函数。
    // 所以流程是：先在 popup.ts 即时更新「无锁的记录」，再回写到「有锁记录」交给 Popup/App.tsx。
    // 这样可以避免新增/删除操作的次序冲突。
    // 外部（popup.tsx）只会读取 menu items，不会直接修改（若要修改，必须透过 popup.ts）。

    // 给脚本添加菜单

    const { key, name, uuid, tabId } = message; // 唯一键, 项目显示名字， 脚本uuid
    // message.key是唯一的。 即使在同一tab里的mainframe subframe也是不一样

    // 以 `${tabId}.${uuid}` 作为隔离命名空间，避免跨分页/框架互相干扰。
    const mrKey = `${tabId}.${uuid}`; // 防止多分页间的registerMenuCommand互相影响

    let menus = menuRegister.get(mrKey) as ScriptMenuItem[];
    if (!menus) {
      menus = [] as ScriptMenuItem[];
      menuRegister.set(mrKey, menus);
    }

    // 以 options+name 生成稳定 groupKey：相同语义项目在 UI 只呈现一次，但可同时触发多个来源（frame）。
    // groupKey 用来表示「相同性质的项目」，允许重叠。
    // 例如 subframe 和 mainframe 创建了相同的 menu item，显示时只会出现一个。
    // 但点击后，两边都会执行。
    // 目的只是整理显示，实际上内部还是存有多笔 entry（分别记录不同的 frameId 和 id）。
    const groupKey = uuidv5(
      JSON.stringify({ ...(message.options || {}), autoClose: "", id: "", name: name }),
      groupKeyNS
    );

    let found = false;
    for (const item of menus) {
      if (item.key === key) {
        found = true;
        // 存在修改信息
        item.name = name;
        item.options = { ...message.options };
        item.groupKey = groupKey;
        break;
      }
    }
    if (!found) {
      const entry = {
        groupKey,
        key: key, // unique primary key
        name: name,
        options: message.options,
        tabId: tabId, // fix
        frameId: message.frameId, // fix with unique key
        documentId: message.documentId, // fix with unique key
      };
      menus.push(entry);
    }
    // 更新有锁记录
    await this.onMenuCommandsChanged(tabId, uuid);
  }

  async unregisterMenuCommand({ key, uuid, tabId }: TScriptMenuUnregister) {
    const mrKey = `${tabId}.${uuid}`;

    let menus = menuRegister.get(mrKey) as ScriptMenuItem[];
    if (!menus) {
      menus = [] as ScriptMenuItem[];
      menuRegister.set(mrKey, menus);
    }

    for (let i = 0, l = menus.length; i < l; i++) {
      if (menus[i].key === key) {
        menus.splice(i, 1);
        break;
      }
    }
    // 更新有锁记录
    await this.onMenuCommandsChanged(tabId, uuid);
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
  scriptToMenu(script: Script, tabId: number): ScriptMenu {
    menuRegister.set(`${tabId}.${script.uuid}`, []);
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
      this.runtime.getPageScriptMatchingResultByUrl(url, true),
      this.getScriptMenu(tabId),
      this.getScriptMenu(-1),
    ]);
    // 与运行时脚本进行合并
    // 以已运行脚本建立快取（uuid→ScriptMenu），供后续合并与覆盖状态。
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
        run = this.scriptToMenu(script, tabId);
        run.isEffective = o.effective!;
      }
      scriptMenuMap.set(script.uuid, run);
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

  // 事务更新脚本菜单
  // 以快取层的事务操作安全更新某 tab 的 ScriptMenu 阵列，避免竞态条件。
  txUpdateScriptMenu(tabId: number, callback: TxUpdateScriptMenuCallback): Promise<ScriptMenu[]> {
    const cacheKey = `${CACHE_KEY_TAB_SCRIPT}${tabId}`;
    return cacheInstance.tx<ScriptMenu[]>(cacheKey, (menu) => callback(menu || []));
  }

  async addScriptRunNumber({ tabId, frameId, scripts }: { tabId: number; frameId: number; scripts: Script[] }) {
    // 设置数据
    return await this.txUpdateScriptMenu(tabId, async (data) => {
      // 特例：frameId 为 0/未提供时，重置当前 tab 的计数资料（视为页面重新载入）。
      if (!frameId) {
        data = [];
      }
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
          const item = this.scriptToMenu(script, tabId);
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
      return this.txUpdateScriptMenu(-1, (menu) => {
        const scriptMenu = menu.find((item) => item.uuid === script.uuid);
        // 加入菜单
        if (!scriptMenu) {
          const item = this.scriptToMenu(script, -1);
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
              const item = this.scriptToMenu(script, -1);
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

  // 触发目标 tab/frame 的「menuClick」事件；key 为菜单唯一键以定位对应 listener。
  async menuClick({ uuid, key, sender, inputValue }: MenuClickParams) {
    // 菜单点击事件
    await this.runtime.emitEventToTab(sender, {
      uuid,
      event: "menuClick",
      eventId: `${key}`,
      data: inputValue,
    });
    return true;
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
      const mrKeys = [...menuRegister.keys()].filter((key) => key.startsWith(`${tabId}.`));
      for (const key of mrKeys) {
        menuRegister.delete(key);
      }
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
        let bgscript = false;
        if (!script) {
          // 从后台脚本中寻找
          const backgroundMenu = await this.getScriptMenu(-1);
          script = backgroundMenu.find((item) => item.uuid === uuid);
          bgscript = true;
        }
        if (script) {
          // 仅触发「非输入型」且 groupKey 相符的项目；同 groupKey 可能代表多个 frame 来源，一次性全部触发。
          const menuItems = script.menus.filter((item) => item.groupKey === groupKey && !item.options?.inputType);
          await Promise.allSettled(
            menuItems.map((menuItem) =>
              this.menuClick({
                uuid: script.uuid,
                key: menuItem.key,
                sender: {
                  tabId: bgscript ? -1 : tab!.id!,
                  frameId: menuItem.frameId || 0,
                  documentId: menuItem.documentId || "",
                },
              } as MenuClickParams)
            )
          );
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
        if (lastActiveTabId > 0 && tabId === lastActiveTabId) {
          await this.updateBadgeIcon();
        }
      }
    );
  }
}
