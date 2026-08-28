import { type IMessageQueue } from "@Packages/message/message_queue";
import { type Group } from "@Packages/message/server";
import { type RuntimeService } from "./runtime";
import type { ScriptMenu, TPopupPageStatus, TPopupScript } from "./types";
import type { GetPopupDataReq, GetPopupDataRes, MenuClickParams } from "./client";
import { cacheInstance } from "@App/app/cache";
import type { ScriptDAO } from "@App/app/repo/scripts";
import {
  applyScriptDisplayInfo,
  scriptToMenu,
  type TPopupPageLoadInfo,
  type TPopupPageRestoreInfo,
} from "./popup_scriptmenu";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL, SCRIPT_RUN_STATUS_RUNNING } from "@App/app/repo/scripts";
import type {
  TDeleteScript,
  TEnableScript,
  TInstallScript,
  TScriptMenuRegister,
  TScriptMenuUnregister,
  TScriptRunStatus,
} from "../queue";
import { getCurrentTab } from "@App/pkg/utils/utils";
import { type SystemConfig } from "@App/pkg/config/config";
import { CACHE_KEY_TAB_LOADED, CACHE_KEY_TAB_SCRIPT } from "@App/app/cache_key";
import { timeoutExecution } from "@App/pkg/utils/timer";
import { v5 as uuidv5 } from "uuid";
import { getPageAccessKind, isExtensionStoreUrl, toOrigin } from "@App/pkg/utils/page_access";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";

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

// 呼叫 API 设置 Badge
const apiSetBadge = (o: { text: string; tabId: number; backgroundColor?: string; textColor?: string }) => {
  const { text, tabId, backgroundColor, textColor } = o;
  if (!text) badgeShownSet.delete(tabId);
  chrome.action.setBadgeText({
    text: text,
    tabId: tabId,
  });
  if (backgroundColor) {
    chrome.action.setBadgeBackgroundColor({
      color: backgroundColor,
      tabId: tabId,
    });
  }
  if (textColor) {
    chrome.action.setBadgeTextColor({
      color: textColor,
      tabId: tabId,
    });
  }
};

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
      let needsParentMenu = false;
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
          needsParentMenu = true;
        } else {
          createProperties.parentId = `scriptMenu`;
        }
        subMenuEntries.push(createProperties);
      }
      if (withMenuItem) {
        // 创建脚本菜单
        if (needsParentMenu) {
          menuEntries.push({
            id: `scriptMenu_${uuid}`,
            title: name,
            contexts: ["all"],
            parentId: "scriptMenu",
          });
        }
        menuEntries.push(...subMenuEntries);
      }
    }
  }

  // 生成chrome菜单
  genScriptMenu() {
    // 使用简单 Promise chain 避免同一个程序同时跑
    contextMenuUpdatePromise = contextMenuUpdatePromise
      .then(async () => {
        const tabId = lastActiveTabId;
        if (tabId > 0) {
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
          : `${nameForKey}_${options.mIndividualKey}`; // 一般菜单项目不需要 JSON.stringify
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
      .then(async (list) => {
        if (!list.length) return;

        // 内容脚本可能在其脚本被删除后，仍迟到地发来 GM_registerMenuCommand。
        // 必须先丢弃这些已删脚本的注册记录，避免它们重新生成残留的 tabScript:<tabId> Popup 菜单项。
        const registerUuids = [
          ...new Set(
            list.filter((entry) => entry.registerType === ScriptMenuRegisterType.REGISTER).map((entry) => entry.uuid)
          ),
        ];
        if (registerUuids.length) {
          // gets() 返回结果与入参下标一一对应，不存在的脚本为 undefined，由此得出「仍存在」的 uuid 集合。
          const scripts = await this.scriptDAO.gets(registerUuids);
          const existingUuids = new Set();
          for (const s of scripts) if (s) existingUuids.add(s.uuid);
          // 倒序遍历删除，避免 splice 改变后续元素下标。
          for (let idx = list.length - 1; idx >= 0; idx--) {
            const entry = list[idx];
            if (entry.registerType === ScriptMenuRegisterType.REGISTER && !existingUuids.has(entry.uuid)) {
              list.splice(idx, 1);
            }
          }
          if (!list.length) {
            this.updateMenuCommands.delete(tabId);
            return;
          }
        }

        return cacheInstance.tx(`${CACHE_KEY_TAB_SCRIPT}${tabId}`, (data: ScriptMenu[] | undefined, tx) => {
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

  // 更新脚本菜单
  async updateScriptMenu(tabId: number) {
    if (tabId > 0) {
      if (tabId !== lastActiveTabId) return; // 其他页面的指令，不理

      // 注意：不要使用 getCurrentTab()。
      // 因为如果使用者切换到其他应用（如 Excel/Photoshop），网页仍可能触发 menu 的注册/解除操作。
      // 若此时用 getCurrentTab()，就无法正确更新右键选单。

      // 检查一下 tab的有效性
      // 仅针对目前 lastActiveTabId 进行检查与更新，避免误在非当前 tab 重建菜单。
      const tab = await chrome.tabs.get(lastActiveTabId);
      if (tab && !tab.frozen && tab.active && !tab.discarded && tab.lastAccessed) {
        // 更新菜单 / 生成菜单
        this.genScriptMenu();
      }
    }
  }

  // 获取popup页面数据
  async getPopupData(req: GetPopupDataReq): Promise<GetPopupDataRes> {
    const { url, tabId } = req;
    const pageStatus = await this.getPageStatus(tabId, url);
    if (pageStatus === "restricted") {
      // 浏览器保留页与自家扩展商店上脚本猫永远触及不到，列出「匹配到的」脚本只会让人以为
      // 它们在跑（#1687）。其余状态的抑制原因都可以解除——开开关、开开发者模式、移出黑名单、
      // 给文件访问权限、刷新页面——照常列出匹配脚本，用户才知道解除后哪些会生效；顶部提示
      // 已经说明了它们现在为什么没跑。后台脚本与当前页无关，照常返回。
      return {
        pageStatus,
        scriptList: [],
        backScriptList: await this.attachScriptDisplayInfo(await this.getScriptMenu(-1)),
      };
    }
    const [matchingResult, runScripts, backScriptList] = await Promise.all([
      this.runtime.getPopupPageScriptMatchingResultByUrl(url),
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
        run.hasMatchOverride = script.selfMetadata?.match !== undefined;
        run.hasUserConfig = !!script.config;
      } else {
        // 由于目前没有在 Popup 显示 @match @include @exclude, 所以以下代码暂不需要
        // if (script.selfMetadata) {
        //   script.metadata = getCombinedMeta(script.metadata, script.selfMetadata);
        // }
        run = scriptToMenu(script);
        run.isEffective = o.effective!;
      }
      run.matchesTopFrame = true;
      scriptMenuMap.set(uuid, run);
    }

    await this.mergeSubFrameRunScripts(tabId, url, runScripts, scriptMenuMap);

    const scriptMenu = [...scriptMenuMap.values()];
    // 即时附加图标与本地化脚本名（仅写入响应，不回写 session 缓存，避免 icon64 等占用过大）
    const [scriptListWithInfo, backScriptListWithInfo] = await Promise.all([
      this.attachScriptDisplayInfo(scriptMenu),
      this.attachScriptDisplayInfo(backScriptList),
    ]);
    // 后台脚本只显示开启或者运行中的脚本
    return { pageStatus, scriptList: scriptListWithInfo, backScriptList: backScriptListWithInfo };
  }

  /**
   * 判断当前页脚本猫是否触及得到。
   *
   * 顺序有意为之：浏览器保留页与黑名单是「无论如何都不会注入」的确定结论，先判；
   * 接着是扩展整体没跑起来的两种情况（全局开关关闭、UserScripts API 不可用），它们与具体
   * 标签页无关，必须先于注入证据 —— 注入证据只是「本 tab 曾经报到过」，页面刷新与关开关都
   * 不会让它失效，用它去否定全局状态会使同一开关状态下老标签页没提示、新标签页有提示。
   * 其余情况以「本 tab 有没有 content script 报到」为准 —— 它是运行时证据，
   * 比协议白名单准（企业策略、扩展商店等都拦不住白名单）。file:// 的权限查询只用来
   * 给未注入的情况一个更准确的原因，不能反过来否定已经注入成功的事实（Firefox 上该
   * 查询与实际可注入性并不总是一致）。
   */
  private async getPageStatus(tabId: number, url: string): Promise<TPopupPageStatus> {
    const kind = getPageAccessKind(url);
    if (kind === "restricted") return "restricted";
    if (this.runtime.isUrlBlacklist(url)) return "blacklist";
    // 脚本功能整体没开时 content script 根本没注册（registerUserscripts 直接 return），
    // 此时说「刷新页面后生效」是错的——刷新永远不会生效，得先开开关/开发者模式。
    if (!this.runtime.isUserScriptsAvailable) return "userscripts-unavailable";
    if (!this.runtime.isLoadScripts) return "scripts-disabled";
    if (await this.isTabInjected(tabId, url)) return "ok";
    // 以下都是「确认没注入」，只为给出更准确的原因。
    // 两项判据都与浏览器有关（Edge 商店在 Chrome 里是普通网页；Firefox 的文件访问开关语义也不同），
    // 放在注入证据之后才不会误伤实际能运行的页面。
    if (isExtensionStoreUrl(url)) return "restricted";
    if (kind === "file" && !(await chrome.extension.isAllowedFileSchemeAccess())) return "file-access-denied";
    return "not-injected";
  }

  /** 本 tab 是否收到过当前 origin 的 content script 报到。 */
  private async isTabInjected(tabId: number, url: string) {
    const origin = await cacheInstance.get<string>(`${CACHE_KEY_TAB_LOADED}${tabId}`);
    return !!origin && origin === toOrigin(url);
  }

  /**
   * 把「只在子 frame（iframe）里跑起来」的脚本并回当前页清单。
   *
   * 清单主体按顶层网址匹配，因此 @match 只命中 iframe 的脚本连同它在 iframe 注册的 GM 菜单
   * 都会整条消失（#1687）。判定条件是「本 tab 跑过 ∧ 现在仍匹配某个子 frame」而非单纯「跑过」：
   * 用户在 Popup 排除本站后脚本对所有 frame 都不再匹配，该行仍会立即消失。
   */
  private async mergeSubFrameRunScripts(
    tabId: number,
    topUrl: string,
    runScripts: ScriptMenu[],
    scriptMenuMap: Map<string, ScriptMenu>
  ) {
    const unmatched = runScripts.filter((script) => !scriptMenuMap.has(script.uuid));
    if (!unmatched.length) return;

    const frameUrls = await this.getSubFrameUrls(tabId, topUrl);
    if (!frameUrls.length) return;

    // effective 取「任一 frame 生效」：脚本只要在某个 frame 上没有被排除，它就确实会在该页运行。
    const frameMatching = new Map<string, boolean>();
    for (const frameUrl of frameUrls) {
      const matchingResult = await this.runtime.getPopupPageScriptMatchingResultByUrl(frameUrl);
      for (const [uuid, o] of matchingResult) {
        frameMatching.set(uuid, frameMatching.get(uuid) || o.effective);
      }
    }

    const matchedRunScripts = unmatched.filter((script) => frameMatching.has(script.uuid));
    if (!matchedRunScripts.length) return;

    // 运行记录来自 tabScript:<tabId> session cache，脚本删除事件与 Popup 读取可能交错，
    // 因此要用 DAO 结果做读侧防护，避免已删除脚本残留在 Popup 清单。
    const scripts = await this.scriptDAO.gets(matchedRunScripts.map((script) => script.uuid));
    for (let idx = 0, l = matchedRunScripts.length; idx < l; idx++) {
      const script = scripts[idx];
      if (!script) continue;
      const run = matchedRunScripts[idx];
      run.enable = script.status === SCRIPT_STATUS_ENABLE;
      run.isEffective = frameMatching.get(run.uuid)!;
      run.hasMatchOverride = script.selfMetadata?.match !== undefined;
      run.hasUserConfig = !!script.config;
      run.matchesTopFrame = false;
      scriptMenuMap.set(run.uuid, run);
    }
  }

  /** 取本 tab 全部子 frame 的网址（去重、排除顶层网址）。标签页已关闭或不可访问时返回空数组。 */
  private async getSubFrameUrls(tabId: number, topUrl: string): Promise<string[]> {
    let frames: chrome.webNavigation.GetAllFrameResultDetails[] | null;
    try {
      frames = await chrome.webNavigation.getAllFrames({ tabId });
    } catch (e) {
      // 取不到框架资料时退化为「只看顶层匹配」，与本功能加入前的行为一致。
      LoggerCore.logger().warn("getAllFrames failed", { tabId }, Logger.E(e));
      return [];
    }
    const urls = new Set<string>();
    for (const frame of frames || []) {
      if (!frame.frameId || !frame.url || frame.url === topUrl) continue;
      urls.add(frame.url);
    }
    return [...urls];
  }

  /** 为 ScriptMenu 列表即时附加图标 URL 与本地化脚本名（返回浅拷贝，不修改缓存中的原对象） */
  private async attachScriptDisplayInfo(list: ScriptMenu[]): Promise<ScriptMenu[]> {
    if (!list.length) return list;
    const scripts = await this.scriptDAO.gets(list.map((s) => s.uuid));
    return list.map((s, i) => (scripts[i] ? applyScriptDisplayInfo(s, scripts[i]!) : s));
  }

  async getScriptMenu(tabId: number): Promise<ScriptMenu[]> {
    const cacheKey = `${CACHE_KEY_TAB_SCRIPT}${tabId}`;
    return (await cacheInstance.get<ScriptMenu[]>(cacheKey)) || [];
  }

  // 菜单变化后同步角标计数缓存（脚本数、运行数）。计数为 0 时存空字符串表示不显示角标。
  // tabId <= 0 为后台菜单(-1)等非真实标签页，跳过。
  private updateCachedScriptMenuCounters(tabId: number, menu: ScriptMenu[]) {
    if (tabId <= 0) return;
    scriptCountMap.set(tabId, menu.length ? `${menu.length}` : "");
    const runCount = menu.reduce((count, script) => count + (script.runNum || 0), 0);
    runCountMap.set(tabId, runCount ? `${runCount}` : "");
  }

  // 把待处理菜单命令队列里属于已删除脚本的项一并清掉，防止它们之后被处理而再次产生残留。
  private removeDeletedScriptsFromPendingMenuCommands(deletedUuids: Set<string>) {
    for (const [tabId, commands] of this.updateMenuCommands) {
      const nextCommands = commands.filter((command) => !deletedUuids.has(command.uuid));
      if (nextCommands.length) {
        if (nextCommands.length !== commands.length) {
          this.updateMenuCommands.set(tabId, nextCommands);
        }
      } else {
        this.updateMenuCommands.delete(tabId);
      }
    }
  }

  // 删除脚本时，扫描「所有」tabScript:<tabId> 缓存清除已删脚本，并同步角标计数。
  // 旧实现只清理了后台菜单(-1)，导致各标签页缓存残留——这是「删除脚本后 Popup 残留」的根因。
  private async removeDeletedScriptsFromPopupCaches(uuids: string[]) {
    if (!uuids.length) return false;

    const deletedUuids = new Set(uuids);
    this.removeDeletedScriptsFromPendingMenuCommands(deletedUuids);

    const keys = (await cacheInstance.list()).filter((key) => key.startsWith(CACHE_KEY_TAB_SCRIPT));
    let changed = false;
    await Promise.all(
      keys.map((key) =>
        cacheInstance.tx(key, (menu: ScriptMenu[] | undefined, tx) => {
          if (!menu?.length) return;
          const nextMenu = menu.filter((item) => !deletedUuids.has(item.uuid));
          if (nextMenu.length === menu.length) return;

          changed = true;
          const tabId = Number(key.slice(CACHE_KEY_TAB_SCRIPT.length));
          this.updateCachedScriptMenuCounters(tabId, nextMenu);
          if (nextMenu.length) {
            tx.set(nextMenu);
          } else {
            tx.del();
          }
        })
      )
    );
    return changed;
  }

  // 顶层 frame 报到即说明本页扩展触及得到，来源有二：页面载入（popupPageLoadUpdate）
  // 与 bfcache 还原（popupPageRestored）。记 origin 而非完整网址，SPA 换页不会失效，
  // 跳到另一个 origin 则自然失效。
  async markTabInjected({ tabId, frameId, url }: TPopupPageRestoreInfo) {
    if (frameId || tabId <= 0) return;
    const origin = toOrigin(url);
    if (origin) await cacheInstance.set(`${CACHE_KEY_TAB_LOADED}${tabId}`, origin);
  }

  async addScriptRunNumber(o: TPopupPageLoadInfo) {
    const { tabId, frameId, scriptmenus } = o;
    // 设置数据
    await cacheInstance.tx(`${CACHE_KEY_TAB_SCRIPT}${tabId}`, (data: ScriptMenu[] | undefined, tx) => {
      const isPrevDataEmpty = !data?.length;
      // 特例：frameId 为 0/未提供时，重置当前 tab 的计数资料（视为页面重新载入）。
      data = !frameId ? [] : data || [];

      // 所有脚本都没有启动。更新适用于之前打开了现在关掉的情况，见 #978
      if (scriptmenus.length === 0 && data.length === 0) {
        scriptCountMap.set(tabId, "");
        runCountMap.set(tabId, "");
        // 之前也是没数据的话，不用 tx.set (storage.session.set)
        if (isPrevDataEmpty) return;
      }

      // 设置脚本运行次数
      scriptmenus.forEach((scriptmenu) => {
        const scriptMenu = data.find((item) => item.uuid === scriptmenu.uuid);
        if (scriptMenu) {
          // runNum：累计总执行次数；runNumByIframe：仅 iframe 执行次数（用于精细显示/统计）。
          scriptMenu.runNum = (scriptMenu.runNum || 0) + 1;
          if (frameId) {
            scriptMenu.runNumByIframe = (scriptMenu.runNumByIframe || 0) + 1;
          }
        } else {
          const item = scriptmenu;
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
          const item = scriptToMenu(script);
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
              const item = scriptToMenu(script);
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
    this.mq.subscribe<TDeleteScript[]>("trashScripts", async (data) => {
      const changed = await this.removeDeletedScriptsFromPopupCaches(data.map(({ uuid }) => uuid));
      if (changed) {
        this.updateBadgeIcon();
        this.genScriptMenu();
      }
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
    await Promise.allSettled(
      menus.map((menu) =>
        this.runtime.emitEventToTab(
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
        )
      )
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
        apiSetBadge({ text: "", tabId });
      }
      return;
    }
    const text = map.get(tabId);
    if (typeof text !== "string") return;
    if (!text && !badgeShownSet.has(tabId)) {
      // 没有脚本不用显示 & 没有设置
      return;
    }
    const backgroundColor = await this.systemConfig.getBadgeBackgroundColor();
    const textColor = await this.systemConfig.getBadgeTextColor();
    // 标记此 tab 的 badge 已设定，便于后续在「不显示」模式时进行清理。
    badgeShownSet.add(tabId);
    timeoutExecution(
      `${cIdKey}-tabId#${tabId}`,
      () => {
        if (!badgeShownSet.has(tabId)) return;
        apiSetBadge({ text, tabId, backgroundColor, textColor });
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
    const clearData = async (tabId: number) => {
      runCountMap.delete(tabId);
      scriptCountMap.delete(tabId);
      cacheInstance.del(`${CACHE_KEY_TAB_LOADED}${tabId}`);
      const list = this.updateMenuCommands.get(tabId);
      if (list) {
        // 避免 menuCommand 更新在 Tab 移除后触发
        list.length = 0;
        this.updateMenuCommands.delete(tabId);
      }
      // 清理数据tab关闭需要释放的数据
      cacheInstance.tx(`${CACHE_KEY_TAB_SCRIPT}${tabId}`, (scripts: ScriptMenu[] | undefined, tx) => {
        if (scripts) {
          tx.del();
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
    };
    chrome.tabs.onRemoved.addListener((tabId) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.tabs.onRemoved:", lastError);
        // 没有 tabId 资讯，无法释放数据
        return;
      }
      clearData(tabId);
    });
    /**
     * @param tabId 当前页面的 tabId。如 tabId 为 null, 则呼叫 getCurrentTab() 以API取当前页面的 tabId。
     */
    const doBadgeAndMenuUpdate = async (tabId: number | undefined | null = null) => {
      if (tabId === null) {
        tabId = await getCurrentTab().then((tab) => tab?.id);
      }
      tabId = tabId || 0;
      if (tabId && tabId > 0) {
        // 若 tabId 有变化，则更新菜单。
        if (lastActiveTabId !== tabId) {
          lastActiveTabId = tabId;
          this.genScriptMenu();
        }
        // 更新Badge显示。
        this.updateBadgeIcon();
      }
    };
    // 监听页面切换加载菜单
    // 进程启动时可能尚未触发 onActivated：补一次初始化以建立当前 tab 的菜单与 badge。
    doBadgeAndMenuUpdate(null);
    chrome.tabs.onActivated.addListener((activeInfo) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.tabs.onActivated:", lastError);
        // 没有 tabId 资讯，无法加载菜单
        return;
      }
      // 目前设计：subframe 和 mainframe 的 contextMenu 是共用的。
      // 换句话说，subframe 的右键菜单可以执行 mainframe 的选项，反之亦然。
      lastActiveTabId = 0; // 强制呼叫 genScriptMenu()
      doBadgeAndMenuUpdate(activeInfo.tabId);
    });

    chrome.webNavigation.onBeforeNavigate.addListener((details) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.webNavigation.onBeforeNavigate:", lastError);
        return;
      }
      // 没有开启脚本时不会触发pageLoad更新数据
      // 这里做一次清理
      if (runCountMap.has(details.tabId) && !this.runtime.isLoadScripts) {
        clearData(details.tabId);
      }
    });

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

    // 监听运行次数
    // 监听页面载入事件以更新脚本执行计数；若为当前活动 tab，同步刷新 badge。
    // bfcache 还原不会重新注入 content script，因此不会再有 popupPageLoadUpdate，
    // 但页面里的脚本连同它注册的菜单都还活着。少了这条，后退回上一页就会被误判成「没在运行」。
    this.mq.subscribe<TPopupPageRestoreInfo>("popupPageRestored", this.markTabInjected.bind(this));
    this.mq.subscribe<TPopupPageLoadInfo>("popupPageLoadUpdate", async (o) => {
      await this.markTabInjected(o);
      await this.addScriptRunNumber(o);
      // 设置角标 (chrome.tabs.onActivated 切换后)
      if (o.tabId === lastActiveTabId) {
        await this.updateBadgeIcon();
      }
    });
  }
}
