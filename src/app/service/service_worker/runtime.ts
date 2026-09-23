import type {
  EmitEventRequest,
  ScriptLoadInfo,
  ScriptMatchInfo,
  ScriptMenu,
  ServiceWorkerExecutionBinding,
} from "./types";
import type { IMessageQueue } from "@Packages/message/message_queue";
import { RequestSequenceWindow } from "@Packages/message/request_sequence_window";
import { GetSenderType, type Group, type IGetSender } from "@Packages/message/server";
import type { ExtMessageSender, MessageConnect, MessageSend } from "@Packages/message/types";
import type { TClientPageLoadInfo } from "@App/app/repo/scripts";
import type {
  SCMetadata,
  Script,
  ScriptDAO,
  ScriptRunResource,
  ScriptSite,
  TScriptInfo,
  UserConfig,
} from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { type ValueService } from "./value";
import GMApi, { GMExternalDependencies } from "./gm_api/gm_api";
import type { TDeleteScript, TEnableScript, TInstallScript, TSortedScript } from "../queue";
import { type ScriptService } from "./script";
import { runScript, stopScript } from "../offscreen/client";
import {
  buildScriptRunResourceBasic,
  compileInjectionCode,
  getCombinedMeta,
  getUserScriptRegister,
  parseUrlSRI,
  scriptURLPatternResults,
  type RegisteredUserScriptWithJsCode,
} from "./utils";
import {
  checkUserScriptsAvailable,
  getMetadataStr,
  getStorageName,
  getUserConfigStr,
  obtainBlackList,
  sourceMapTo,
} from "@App/pkg/utils/utils";
import { BrowserType, getBrowserInstalledVersion, getBrowserType, isPermissionOk } from "@App/pkg/utils/utils";
import { cacheInstance } from "@App/app/cache";
import { UrlMatch } from "@App/pkg/utils/match";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { ExtensionContentMessageSend } from "@Packages/message/extension_message";
import { sendMessage } from "@Packages/message/client";
import type { CompileScriptCodeResource } from "../content/utils";
import { getExtensionOrigin, getPageRpcAllowedAPIs, type ExtensionOrigin } from "../content/page_rpc";
import {
  compileInjectScriptByFlag,
  compileScriptCodeByResource,
  compileScriptletCode,
  getEffectiveScriptGrants,
  isContextMenuScript,
  isEarlyStartScript,
  isInjectIntoContent,
  isScriptletUnwrap,
  trimScriptInfo,
} from "../content/utils";
import LoggerCore from "@App/app/logger/core";
import PermissionVerify from "./permission_verify";
import { type SystemConfig } from "@App/pkg/config/config";
import { type ResourceService } from "./resource";
import { type LocalStorageDAO } from "@App/app/repo/localStorage";
import Logger from "@App/app/logger/logger";
import type { GMInfoEnv, ValueUpdateDataEncoded } from "../content/types";
import { initLocalesPromise, localePath } from "@App/locales/locales";
import { DocumentationSite } from "@App/app/const";
import { extractUrlPatterns, RuleType, RuleTypeBit, type URLRuleEntry } from "@App/pkg/utils/url_matcher";
import { parseUserConfig } from "@App/pkg/utils/yaml";
import type { CompiledResource, Resource, ResourceType } from "@App/app/repo/resource";
import { CompiledResourceDAO, CompiledResourceNamespace } from "@App/app/repo/resource";
import { setOnTabURLChanged } from "./url_monitor";
import { scriptToMenu, type TPopupPageLoadInfo, type TPopupPageRestoreInfo } from "./popup_scriptmenu";
import { getExtensionUserAgentData } from "../extension/extension_env";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { sha256OfText } from "@App/pkg/utils/crypto";

const ORIGINAL_URLMATCH_SUFFIX = "{ORIGINAL}"; // 用于标记原始URLPatterns的后缀

const RuntimeRegisterCode = {
  UNSET: 0,
  REGISTER_DONE: 1,
  UNREGISTER_DONE: 2,
} as const;

type RuntimeRegisterCode = ValueOf<typeof RuntimeRegisterCode>;

type TCodeCache = {
  cacheKey: string;
  code: string;
  metadataStr: string;
  userConfigStr: string;
  userConfig: UserConfig | undefined;
};

type TRuntimeResource = { base64?: string } & Omit<Resource, "base64">;
type TRuntimeResourceByType = Record<ResourceType, Record<string, TRuntimeResource>>;

type TLocalResourceCache = {
  resourceKey: string;
  url: string;
  type: ResourceType;
  sha512: string | undefined;
};

type TPageLoadScriptCache = {
  scriptCacheKey: string;
  scriptRevision: string;
  originalMetadata: SCMetadata;
  scriptUrlPatterns: URLRuleEntry[];
  originalUrlPatterns: URLRuleEntry[] | null;
  code: string;
  metadataStr: string;
  userConfigStr: string;
  userConfig: UserConfig | undefined;
  resourceByType: TRuntimeResourceByType;
  localResources: TLocalResourceCache[];
};

const runtimeGlobal = {
  registerState: RuntimeRegisterCode.UNSET,
  messageFlag: "PENDING",
} as {
  registerState: RuntimeRegisterCode;
  messageFlag: string;
};

export type TTabInfo = {
  url: string;
  tabId: number | undefined;
  frameId: number | undefined;
  incognito?: boolean;
};

export type TScriptsForTab = {
  injectScriptList: TScriptInfo[];
  contentScriptList: TScriptInfo[];
  envInfo: GMInfoEnv;
  scriptmenus: ScriptMenu[];
} | null;

type UserScriptSession = {
  scripts: TScriptInfo[];
  envInfo: GMInfoEnv;
  extensionOrigin?: ExtensionOrigin;
  reconnectToken: string;
  envTag: "it" | "ct";
  url: string;
  tabId: number;
  frameId?: number;
  documentId?: string;
  transport: "userScript" | "extension";
  // 断线窗口内按 storageName 合并值更新，重连握手完成后再投递。
  pendingValueUpdates: Map<string, ValueUpdateDataEncoded>;
};
type UserScriptBootstrap = Omit<UserScriptSession, "transport">;

const bgScriptStorageNames = new Set<string>();

// For Firefox, StorageArea.setAccessLevel is not implemented.
// See https://bugzilla.mozilla.org/show_bug.cgi?id=1724754
// const deliveryStorage = isFirefox() ? chrome.storage.local : chrome.storage.session;
const deliveryStorage = chrome.storage.local; // 日后再处理

export class RuntimeService {
  scriptMatchEnable: UrlMatch<string> = new UrlMatch<string>();
  blackMatch: UrlMatch<string> = new UrlMatch<string>();
  private gmApi?: GMApi;
  // 句柄绑定到 tab/frame/document；页面导航、脚本变更或窗口关闭时必须整体撤销。
  private readonly pageExecutionBindings = new Map<string, ServiceWorkerExecutionBinding>();
  // 原生 page/content 端口只保留各自签发的句柄，回调发送前再按该集合过滤一次。
  private readonly userScriptConnections = new Map<
    string,
    {
      connection: MessageConnect;
      handles: Set<string>;
      envTag: "it" | "ct";
      tabId: number;
      frameId?: number;
      documentId?: string;
      ready: boolean;
    }
  >();
  private readonly userScriptBootstraps = new Map<string, UserScriptBootstrap>();
  // 连接断开后保留当前文档的已验证资料与待投递值更新，供 USER_SCRIPT 通过原生消息重连；导航或脚本撤销会同步清除。
  private readonly userScriptSessions = new Map<string, UserScriptSession>();
  // Only the newest load for a tab/frame/environment may issue bindings; navigation can resolve old requests late.
  private readonly pageLoadSequences = new Map<string, number>();

  getGMApi(): GMApi | undefined {
    return this.gmApi;
  }

  private revokePageBindings(sender: IGetSender, envTag?: "it" | "ct"): void {
    // pageLoad 是文档切换信号；按 tab/frame 退休旧句柄，避免旧文档继续使用上一页的权限。
    const source = sender.getSender();
    const tabId = source?.tab?.id;
    const frameId = source?.frameId;
    for (const [handle, binding] of this.pageExecutionBindings) {
      if (
        binding.tabId === tabId &&
        binding.frameId === frameId &&
        (envTag === undefined || binding.envTag === envTag || (envTag === "it" && binding.envTag === "ct"))
      ) {
        this.pageExecutionBindings.delete(handle);
      }
    }
    if (envTag === "it") {
      for (const [key, entry] of this.userScriptConnections) {
        if (entry.tabId === tabId && entry.frameId === frameId) {
          entry.connection.disconnect(true);
          this.userScriptConnections.delete(key);
          this.userScriptSessions.delete(key);
        }
      }
      for (const [key, session] of this.userScriptSessions) {
        if (session.tabId === tabId && session.frameId === frameId) this.userScriptSessions.delete(key);
      }
    }
    if (envTag !== "ct") {
      for (const [token, bootstrap] of this.userScriptBootstraps) {
        if (bootstrap.tabId === tabId && bootstrap.frameId === frameId) this.userScriptBootstraps.delete(token);
      }
    }
  }

  revokePageBindingsForTab(tabId: number): void {
    for (const [handle, binding] of this.pageExecutionBindings) {
      if (binding.tabId === tabId) this.pageExecutionBindings.delete(handle);
    }
    for (const [key, entry] of this.userScriptConnections) {
      if (entry.tabId === tabId) {
        entry.connection.disconnect(true);
        this.userScriptConnections.delete(key);
        this.userScriptSessions.delete(key);
      }
    }
    for (const [token, bootstrap] of this.userScriptBootstraps) {
      if (bootstrap.tabId === tabId) this.userScriptBootstraps.delete(token);
    }
    for (const [key, session] of this.userScriptSessions) {
      if (session.tabId === tabId) this.userScriptSessions.delete(key);
    }
    const prefix = `${tabId}:`;
    for (const key of this.pageLoadSequences.keys()) {
      if (key.startsWith(prefix)) this.pageLoadSequences.delete(key);
    }
  }

  private beginPageLoadSequence(sender: IGetSender, envTag: "it" | "ct" | undefined): [string, number] | undefined {
    const tabId = sender.getSender()?.tab?.id;
    if (typeof tabId !== "number") return undefined;
    const key = `${tabId}:${sender.getSender()?.frameId ?? -1}:${envTag ?? "it"}`;
    const sequence = (this.pageLoadSequences.get(key) ?? 0) + 1;
    this.pageLoadSequences.set(key, sequence);
    return [key, sequence];
  }

  private userScriptConnectionKey(
    tabId: number,
    frameId: number | undefined,
    documentId: string | undefined,
    envTag: "it" | "ct"
  ): string {
    return `${tabId}:${frameId ?? -1}:${documentId ?? ""}:${envTag}`;
  }

  /** Register the native USER_SCRIPT channel used for private bootstrap and callbacks; fallback ports remain token-bound. */
  registerUserScriptConnection(data: unknown, sender: IGetSender): boolean {
    // bootstrap token 只允许对应 tab/frame/document 使用一次；documentId 缺失时以 URL 作为文档身份，并且必须覆盖本次下发的全部句柄。
    if (!sender.isType(GetSenderType.EXTCONNECT)) return false;
    if (data === null || typeof data !== "object") return false;
    const handshake = data as { world?: unknown; bootstrapToken?: unknown; transport?: unknown };
    const origin = sender.getConnectOrigin?.();
    const isExtensionFallback = origin === "extension" && handshake.transport === "extension";
    if (origin === "userScript" ? handshake.transport !== undefined : !isExtensionFallback) return false;
    if (
      Object.keys(data).length !== (isExtensionFallback ? 3 : 2) ||
      typeof handshake.bootstrapToken !== "string" ||
      handshake.bootstrapToken.length === 0 ||
      handshake.bootstrapToken.length > 256
    ) {
      return false;
    }
    const source = sender.getSender();
    const connection = sender.getConnect();
    const tabId = source?.tab?.id;
    if (!source || typeof tabId !== "number" || !connection) return false;
    const bootstrap = this.userScriptBootstraps.get(handshake.bootstrapToken);
    if (
      !bootstrap ||
      bootstrap.tabId !== tabId ||
      bootstrap.frameId !== source.frameId ||
      bootstrap.documentId !== source.documentId ||
      (bootstrap.documentId === undefined &&
        (typeof source.url !== "string" || source.url.length === 0 || bootstrap.url !== source.url))
    ) {
      return false;
    }
    // 原生 user-script session 只服务 USER_SCRIPT world；MAIN 统一走 keyed page bridge。
    if (bootstrap.envTag !== "ct" || handshake.world !== "USER_SCRIPT") return false;
    const handles = new Set<string>();
    for (const script of bootstrap.scripts) {
      const handle = script.executionHandle;
      if (typeof handle !== "string" || handle.length === 0 || handle.length > 256) return false;
      const binding = this.pageExecutionBindings.get(handle);
      if (
        !binding ||
        binding.envTag !== bootstrap.envTag ||
        binding.tabId !== tabId ||
        binding.frameId !== source.frameId ||
        binding.documentId !== source.documentId
      ) {
        return false;
      }
      handles.add(handle);
    }
    if (handles.size === 0) return false;
    const frameId = source.frameId;
    const documentId = source.documentId;
    const key = this.userScriptConnectionKey(tabId, frameId, documentId, bootstrap.envTag);
    const session = { ...bootstrap, transport: isExtensionFallback ? ("extension" as const) : ("userScript" as const) };
    this.userScriptSessions.set(key, session);
    this.userScriptBootstraps.delete(handshake.bootstrapToken);
    const previous = this.userScriptConnections.get(key);
    if (previous) previous.connection.disconnect(true);
    const entry = { connection, handles, envTag: bootstrap.envTag, tabId, frameId, documentId, ready: false };
    this.userScriptConnections.set(key, entry);
    connection.onDisconnect(() => {
      if (this.userScriptConnections.get(key)?.connection === connection) this.userScriptConnections.delete(key);
    });
    let bootstrapped = false;
    connection.onMessage((packet) => {
      if (
        bootstrapped ||
        packet === null ||
        typeof packet !== "object" ||
        Object.keys(packet).length !== 1 ||
        packet.action !== "userScript/bootstrap"
      ) {
        return;
      }
      bootstrapped = true;
      try {
        const pageLoadData = {
          scripts: bootstrap.scripts,
          envInfo: bootstrap.envInfo,
          reconnectToken: bootstrap.reconnectToken,
          extensionOrigin: bootstrap.extensionOrigin,
        };
        connection.sendMessage({
          action: "content/pageLoad",
          data: pageLoadData,
        });
        entry.ready = true;
        this.flushPendingUserScriptValueUpdates(key, entry);
      } catch {
        this.userScriptConnections.delete(key);
      }
    });
    return true;
  }

  reconnectUserScript(data: unknown, sender: IGetSender): { bootstrapToken: string } | undefined {
    if (!sender.isType(GetSenderType.RUNTIME)) {
      return undefined;
    }
    if (
      data === null ||
      typeof data !== "object" ||
      Object.keys(data).length !== 1 ||
      typeof (data as { reconnectToken?: unknown }).reconnectToken !== "string" ||
      (data as { reconnectToken: string }).reconnectToken.length === 0 ||
      (data as { reconnectToken: string }).reconnectToken.length > 256
    ) {
      return undefined;
    }
    const source = sender.getSender();
    const tabId = source?.tab?.id;
    if (!source || typeof tabId !== "number") return undefined;
    let key: string | undefined;
    let session: UserScriptSession | undefined;
    for (const [candidateKey, candidateSession] of this.userScriptSessions) {
      if (
        candidateSession.tabId === tabId &&
        candidateSession.frameId === source.frameId &&
        candidateSession.documentId === source.documentId &&
        (candidateSession.documentId !== undefined ||
          (typeof source.url === "string" && source.url.length > 0 && candidateSession.url === source.url)) &&
        candidateSession.reconnectToken === (data as { reconnectToken: string }).reconnectToken
      ) {
        key = candidateKey;
        session = candidateSession;
        break;
      }
    }
    if (!key || !session) return undefined;
    if (sender.getConnectOrigin?.() !== session.transport) return undefined;
    for (const script of session.scripts) {
      const handle = script.executionHandle;
      const binding = typeof handle === "string" ? this.pageExecutionBindings.get(handle) : undefined;
      if (
        !binding ||
        binding.envTag !== session.envTag ||
        binding.tabId !== tabId ||
        binding.frameId !== source.frameId ||
        binding.documentId !== source.documentId
      ) {
        this.userScriptSessions.delete(key);
        return undefined;
      }
    }
    const bootstrapToken = uuidv4();
    const nextSession = { ...session, reconnectToken: uuidv4() };
    for (const [token, bootstrap] of this.userScriptBootstraps) {
      if (
        bootstrap.tabId === session.tabId &&
        bootstrap.frameId === session.frameId &&
        bootstrap.documentId === session.documentId
      ) {
        this.userScriptBootstraps.delete(token);
      }
    }
    this.userScriptSessions.set(key, nextSession);
    this.userScriptBootstraps.set(bootstrapToken, nextSession);
    return { bootstrapToken };
  }

  private queuePendingUserScriptValueUpdate(key: string, data: ValueUpdateDataEncoded): void {
    const session = this.userScriptSessions.get(key);
    if (!session) return;
    const previous = session.pendingValueUpdates.get(data.storageName);
    if (!previous) {
      session.pendingValueUpdates.set(data.storageName, data);
      return;
    }
    const entries: ValueUpdateDataEncoded["entries"] = previous.entries.map((entry) => [entry[0], entry[1], entry[2]]);
    const entryIndexes = new Map<string, number>();
    for (let index = 0; index < entries.length; index += 1) entryIndexes.set(entries[index][0], index);
    for (const entry of data.entries) {
      const index = entryIndexes.get(entry[0]);
      if (index === undefined) {
        entryIndexes.set(entry[0], entries.length);
        entries.push([entry[0], entry[1], entry[2]]);
      } else {
        entries[index] = [entry[0], entry[1], entries[index][2]];
      }
    }
    session.pendingValueUpdates.set(data.storageName, {
      ...data,
      entries,
      valueUpdated: previous.valueUpdated || data.valueUpdated,
    });
  }

  private flushPendingUserScriptValueUpdates(
    key: string,
    entry: { connection: MessageConnect; envTag: "it" | "ct" }
  ): void {
    const session = this.userScriptSessions.get(key);
    if (!session) return;
    for (const [storageName, data] of session.pendingValueUpdates) {
      entry.connection.sendMessage({
        action: `${entry.envTag === "it" ? "inject" : "content"}/runtime/valueUpdate`,
        data,
      });
      session.pendingValueUpdates.delete(storageName);
    }
  }

  private sendUserScriptMessage(to: ExtMessageSender | undefined, action: string, data: unknown): void {
    const dataRecord =
      typeof data === "object" && data !== null ? (data as { uuid?: unknown; storageName?: unknown }) : undefined;
    const targetUuid = action === "runtime/emitEvent" ? dataRecord?.uuid : undefined;
    const targetStorageName = action === "runtime/valueUpdate" ? dataRecord?.storageName : undefined;
    const valueUpdate =
      action === "runtime/valueUpdate" && typeof dataRecord?.storageName === "string"
        ? (data as ValueUpdateDataEncoded)
        : undefined;
    // 先按页面定位，再按句柄对应的脚本或 storageName 过滤，避免跨脚本广播私有回调。
    for (const [key, entry] of this.userScriptConnections) {
      if (
        to &&
        (entry.tabId !== to.tabId ||
          (to.frameId !== undefined && entry.frameId !== to.frameId) ||
          (to.documentId !== undefined && entry.documentId !== to.documentId))
      ) {
        continue;
      }
      let bindingMatches = false;
      for (const handle of entry.handles) {
        const binding = this.pageExecutionBindings.get(handle);
        if (
          binding &&
          ((targetUuid !== undefined && targetUuid === binding.uuid) ||
            (targetStorageName !== undefined && targetStorageName === binding.storageName))
        ) {
          bindingMatches = true;
          break;
        }
      }
      if (!bindingMatches) continue;
      if (!entry.ready) {
        if (valueUpdate) this.queuePendingUserScriptValueUpdate(key, valueUpdate);
        continue;
      }
      try {
        entry.connection.sendMessage({ action: `${entry.envTag === "it" ? "inject" : "content"}/${action}`, data });
      } catch {
        this.userScriptConnections.delete(key);
        if (valueUpdate) this.queuePendingUserScriptValueUpdate(key, valueUpdate);
      }
    }
    if (!valueUpdate) return;
    for (const [key, session] of this.userScriptSessions) {
      if (this.userScriptConnections.has(key)) continue;
      if (
        to &&
        (session.tabId !== to.tabId ||
          (to.frameId !== undefined && session.frameId !== to.frameId) ||
          (to.documentId !== undefined && session.documentId !== to.documentId))
      ) {
        continue;
      }
      let bindingMatches = false;
      for (const script of session.scripts) {
        const handle = script.executionHandle;
        const binding = typeof handle === "string" ? this.pageExecutionBindings.get(handle) : undefined;
        if (
          binding &&
          ((targetUuid !== undefined && targetUuid === binding.uuid) ||
            (targetStorageName !== undefined && targetStorageName === binding.storageName))
        ) {
          bindingMatches = true;
          break;
        }
      }
      if (bindingMatches) this.queuePendingUserScriptValueUpdate(key, valueUpdate);
    }
  }

  private revokePageBindingsForScript(uuid: string): void {
    for (const [handle, binding] of this.pageExecutionBindings) {
      if (binding.uuid === uuid) this.pageExecutionBindings.delete(handle);
    }
    for (const [key, entry] of this.userScriptConnections) {
      // 脚本撤销后同步裁剪句柄集；没有任何有效句柄的端口必须关闭，避免残留授权接收器。
      for (const handle of entry.handles) {
        const binding = this.pageExecutionBindings.get(handle);
        if (!binding || binding.uuid === uuid) entry.handles.delete(handle);
      }
      if (entry.handles.size === 0) {
        entry.connection.disconnect(true);
        this.userScriptConnections.delete(key);
      }
    }
    for (const [token, bootstrap] of this.userScriptBootstraps) {
      if (bootstrap.scripts.some((script) => script.uuid === uuid)) this.userScriptBootstraps.delete(token);
    }
    for (const [key, session] of this.userScriptSessions) {
      if (session.scripts.some((script) => script.uuid === uuid)) this.userScriptSessions.delete(key);
    }
  }

  private issuePageBinding(
    uuid: string,
    envTag: "it" | "ct",
    storageName: string,
    allowedAPIs: readonly string[],
    sender: IGetSender
  ): ServiceWorkerExecutionBinding {
    const source = sender.getSender();
    const tabId = source?.tab?.id;
    const url = source?.url;
    if (typeof tabId !== "number" || typeof url !== "string" || url.length === 0) {
      throw new Error("page execution binding requires a tab and URL");
    }
    // 每次 pageLoad 都签发新句柄和 runFlag；它们共同绑定当前文档的授权生命周期。
    const handle = uuidv4();
    const binding = {
      handle,
      uuid,
      envTag,
      runFlag: uuidv4(),
      url,
      tabId,
      frameId: source?.frameId,
      documentId: source?.documentId,
      storageName,
      allowedAPIs: new Set(allowedAPIs),
      requestSequenceWindow: new RequestSequenceWindow(),
    } satisfies ServiceWorkerExecutionBinding;
    this.pageExecutionBindings.set(handle, binding);
    return binding;
  }

  resolvePageExecutionBinding(handle: string, sender: IGetSender): ServiceWorkerExecutionBinding | undefined {
    const binding = this.pageExecutionBindings.get(handle);
    const source = sender.getSender();
    if (
      !binding ||
      !source?.tab ||
      source.tab.id !== binding.tabId ||
      source.frameId !== binding.frameId ||
      (binding.documentId === undefined && source.url !== binding.url)
    )
      return undefined;
    if (binding.documentId !== undefined && source.documentId !== binding.documentId) return undefined;
    return binding;
  }

  private readonly disabledMatcherTaskKey = `runtime_disabled_matcher:${Math.random()}`;
  private disabledMatcher: UrlMatch<string> | null = null;
  private disabledMatcherVersion = 0;
  private sorter: Record<string, number> = {};
  private readonly codeCacheMap = new Map<string, TCodeCache>();
  private readonly pageLoadCaches = new Map<string, TPageLoadScriptCache>();
  private sandboxInitializationReplayed = false;
  private readonly cachedPatterns = new Map<
    string,
    { scriptUrlPatterns: URLRuleEntry[]; originalUrlPatterns: URLRuleEntry[] }
  >();

  logger: Logger;

  // 当前扩充是否允许执行 UserScripts API (例如是否已打开开发者模式，或已给予 userScripts 权限)
  // 在未初始化前，预设 false。一般情况初始化值会很快被替换
  isUserScriptsAvailable = false;

  // 当前扩充是否开启了启用脚本
  // 在未初始化前，预设 true。一般情况初始化值会很快被替换
  isLoadScripts = true;

  // 当前扩充的userAgentData
  // 在未初始化前，预设 {}。一般情况初始化值会很快被替换
  // 注意：即使没有使用 Object.freeze, 也不应该直接修改物件内容 (immutable)
  userAgentData: typeof GM_info.userAgentData = {};

  // 当前扩充的blacklist
  // 在未初始化前，预设 []。一般情况初始化值会很快被替换
  // 注意：即使没有使用 Object.freeze, 也不应该直接修改阵列内容 (immutable)
  blacklist: string[] = [];
  blacklistExcludeMatches: string[] = [];
  blacklistExcludeGlobs: string[] = [];

  // 获取inject.js内容时调用，需要预先调用preInject
  injectJsCodePromise: Promise<string | undefined> | null = null;
  contentJsCodePromise: Promise<string | undefined> | null = null;

  // initReady
  initReady: Promise<boolean> | boolean = false;

  mq: IMessageQueue;

  sitesLoaded: Set<string> = new Set<string>();
  updateSitesBusy: boolean = false;

  loadingInitProcessPromise: Promise<any> | undefined;
  initialCompiledResourcePromise: Promise<any> | undefined;

  compiledResourceDAO: CompiledResourceDAO = new CompiledResourceDAO();

  constructor(
    private systemConfig: SystemConfig,
    private group: Group,
    private msgSender: MessageSend,
    mq: IMessageQueue,
    private value: ValueService,
    public script: ScriptService,
    private resource: ResourceService,
    private scriptDAO: ScriptDAO,
    private localStorageDAO: LocalStorageDAO
  ) {
    this.logger = LoggerCore.logger({ component: "runtime" });

    // 使用中间件
    this.group = this.group.use(async (_, __, next) => {
      if (typeof this.initReady !== "boolean") await this.initReady;
      return next();
    });
    this.mq = mq.group("", async (_, __, next) => {
      if (typeof this.initReady !== "boolean") await this.initReady;
      return next();
    });
  }

  async initUserAgentData() {
    this.userAgentData = (await getExtensionUserAgentData()) || {};
  }

  async showUserscriptActivationGuide() {
    const storageKey = "firstShowDeveloperMode";
    chrome.action.setBadgeBackgroundColor({
      color: "#ff8c00",
    });
    chrome.action.setBadgeTextColor({
      color: "#ffffff",
    });
    chrome.action.setBadgeText({
      text: "!",
    });

    chrome.permissions.onAdded.addListener((permissions: chrome.permissions.Permissions) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.permissions.onAdded:", lastError);
        return;
      }
      if (permissions.permissions?.includes("userScripts")) {
        chrome.action.setBadgeBackgroundColor({
          color: [0, 0, 0, 0], // transparent (RGBA)
        });
        chrome.action.setBadgeTextColor({
          color: "#ffffff", // default is white
        });
        chrome.action.setBadgeText({
          text: "", // clears badge
        });
      }
    });

    const currentInstalledBrowser = getBrowserInstalledVersion();
    const lastInstalledBrowser = (await this.localStorageDAO.get(storageKey))?.value as string | boolean | undefined;
    // 判断是否安装后的首次，或是浏览器升级后的首次
    if (currentInstalledBrowser === lastInstalledBrowser) return; // 非首次则不弹出页面

    const savePromise = this.localStorageDAO.save({
      key: storageKey,
      value: currentInstalledBrowser,
    });
    await Promise.allSettled([initLocalesPromise, this.initReady, savePromise]); // 等一下语言加载和 isUserScriptsAvailable 检查之类的

    const userscript_enabled: boolean = this.isUserScriptsAvailable;
    const permission = await isPermissionOk("userScripts");
    const browserType = getBrowserType();
    const guard =
      browserType.chrome & BrowserType.guardedByDeveloperMode
        ? "developerMode"
        : browserType.chrome & BrowserType.guardedByAllowScript
          ? "allowScript"
          : "none";

    // 打开页面
    const path = `${DocumentationSite}${localePath}/docs/use/open-dev/`;
    let search = `?userscript_enabled=${userscript_enabled}&userscript_permission=${permission}&userscript_guard=${guard}`;
    if (browserType.chrome & BrowserType.Edge) search += "&browser=edge";
    else if (browserType.chrome & BrowserType.Chrome) search += "&browser=chrome";
    const hash = `${guard === "developerMode" ? "#enable-developer-mode" : guard === "allowScript" ? "#allow-user-scripts" : ""}`;
    chrome.tabs.create({ url: `${path}${search}${hash}` });
  }

  async getInjectJsCode() {
    if (!this.injectJsCodePromise) {
      this.injectJsCodePromise = fetch("/src/inject.js")
        .then((res) => res.text())
        .catch((e) => {
          this.logger.error("load extension runtime script failed", { path: "/src/inject.js" }, Logger.E(e));
          return undefined;
        });
    }
    return this.injectJsCodePromise;
  }

  async getContentJsCode() {
    if (!this.contentJsCodePromise) {
      this.contentJsCodePromise = fetch("/src/content.js")
        .then((res) => res.text())
        .catch((e) => {
          this.logger.error("load extension runtime script failed", { path: "/src/content.js" }, Logger.E(e));
          return undefined;
        });
    }
    return this.contentJsCodePromise;
  }

  private getOriginalMatchUuid(uuid: string) {
    return `${uuid}${ORIGINAL_URLMATCH_SUFFIX}`;
  }

  // 使 Popup 懒构建的 disabled 匹配器失效（递增版本号 + 清空缓存），下次取用时会重新构建。
  private invalidateDisabledMatcher() {
    if (++this.disabledMatcherVersion > 1e9) this.disabledMatcherVersion = 1; // 防止版本号溢出
    this.disabledMatcher = null;
  }

  // 脚本内容/状态变化时，一次性清掉该脚本的三层运行时缓存（页面加载、代码、匹配模式）。
  private deleteScriptRuntimeCache(uuid: string) {
    this.pageLoadCaches.delete(uuid);
    this.codeCacheMap.delete(uuid);
    this.cachedPatterns.delete(uuid);
  }

  private updateSorter(mutate: (next: Record<string, number>) => void) {
    const next = { ...this.sorter };
    mutate(next);
    this.sorter = next;
    // UrlMatch 只在 sorter 对象引用变化时才会清空其 URL 结果缓存。
    // 因此切勿原地修改 this.sorter，必须整个替换，才能让已缓存的 URL 排序失效。
    this.scriptMatchEnable.setupSorter(next);
    this.invalidateDisabledMatcher();
  }

  // 同时维护主 uuid 与自定义排除产生的 {uuid}{Ori} 键的排序权重，两者必须保持一致。
  private setScriptSort(next: Record<string, number>, script: Pick<Script, "uuid" | "sort">) {
    next[script.uuid] = script.sort;
    next[this.getOriginalMatchUuid(script.uuid)] = script.sort;
  }

  private deleteScriptSort(next: Record<string, number>, uuid: string) {
    delete next[uuid];
    delete next[this.getOriginalMatchUuid(uuid)];
  }

  createMatchInfoEntry(
    scriptRes: ScriptRunResource,
    o: { scriptUrlPatterns: URLRuleEntry[]; originalUrlPatterns: URLRuleEntry[] | null }
  ) {
    // 优化性能，将不需要的信息去掉
    // 而且可能会超过缓存的存储限制
    const matchInfo = {
      ...scriptRes,
      scriptUrlPatterns: o.scriptUrlPatterns,
      originalUrlPatterns: o.originalUrlPatterns === null ? o.scriptUrlPatterns : o.originalUrlPatterns,
      code: "",
      value: {},
      resource: {},
    } as ScriptMatchInfo;
    return matchInfo;
  }

  async waitInit() {
    const [cRuntimeStartFlag, storedNamespace, allScripts] = await Promise.all([
      cacheInstance.get<boolean>("runtimeStartFlag"),
      this.localStorageDAO.getValue<string>("compiledResourceNamespace"),
      this.scriptDAO.all(),
    ]);

    // 用轻量的命名空间字符串判断是否需要清理旧缓存（避免启动时全量读取 CompiledResources 进内存）。
    // CompiledResource 结构变更时只需改动 CompiledResourceNamespace 常量，即可在下次启动强制清旧重建。
    const shouldCleanUpPreviousRegister = storedNamespace !== CompiledResourceNamespace;
    const unregisterScriptIds: string[] = [];
    const enabledNormalScripts: Script[] = [];

    // 阶段一：刻意保持全同步——在引入任何 await 之前，先完成脚本分类、排序更新与反注册目标的计算，
    // 避免日后有人不小心往循环里加入 await 而破坏这里的执行时序。
    for (const script of allScripts) {
      const isNormalScript = script.type === SCRIPT_TYPE_NORMAL;
      const enable = script.status === SCRIPT_STATUS_ENABLE;
      if (!isNormalScript || !enable || shouldCleanUpPreviousRegister) {
        unregisterScriptIds.push(script.uuid);
      }
      if (isNormalScript && enable) {
        enabledNormalScripts.push(script);
      }
    }

    this.updateSorter((next) => {
      for (const script of allScripts) {
        this.setScriptSort(next, script);
      }
    });

    // 阶段二：只预热「已启用的普通脚本」。禁用脚本刻意不参与 Service Worker 启动，
    // 改由 Popup 通过 buildDisabledMatcher() 按需懒构建匹配。
    this.initialCompiledResourcePromise = Promise.all(
      enabledNormalScripts.map(async (script) => {
        const uuid = script.uuid;
        let compiledResource = await this.compiledResourceDAO.get(uuid);
        if (!compiledResource) {
          const ret = await this.buildCompiledResourceFromScript(script, false);
          if (!ret) return;
          compiledResource = ret.compiledResource;
        }
        if (!compiledResource?.scriptUrlPatterns) {
          this.logger.error("No compiledResource or scriptUrlPatterns found", { uuid });
          return;
        }

        const { scriptUrlPatterns, originalUrlPatterns } = compiledResource;
        const uuidOri = this.getOriginalMatchUuid(uuid);
        this.cachedPatterns.set(uuid, {
          scriptUrlPatterns,
          originalUrlPatterns: originalUrlPatterns === null ? scriptUrlPatterns : originalUrlPatterns,
        });
        this.scriptMatchEnable.addRules(uuid, scriptUrlPatterns);
        if (originalUrlPatterns !== null && originalUrlPatterns !== scriptUrlPatterns) {
          this.scriptMatchEnable.addRules(uuidOri, originalUrlPatterns);
        }
      })
    );

    if (shouldCleanUpPreviousRegister) {
      unregisterScriptIds.push(
        // 兼容旧的注册ID，过渡期后可移除
        "scriptcat-early-start-flag",
        "scriptcat-inject",
        "scriptcat-content"
      );
    }
    if (unregisterScriptIds.length) {
      // 忽略 UserScripts API 无法执行
      await Promise.allSettled([this.unregistryPageScripts(unregisterScriptIds, true)]); // ignore success or fail
    }
    if (!cRuntimeStartFlag) {
      await cacheInstance.set<boolean>("runtimeStartFlag", true);
    }
    if (shouldCleanUpPreviousRegister) {
      // 清理完成后写回当前命名空间，下次启动命中相同值即可跳过清理。
      await this.localStorageDAO.saveValue("compiledResourceNamespace", CompiledResourceNamespace);
    }

    let count = 0;
    try {
      const res = await chrome.userScripts?.getScripts({ ids: ["scriptcat-inject"] });
      count = res?.length;
    } catch {
      // 该错误为预期内情况，无需记录 debug 日志
    } finally {
      // 考虑 UserScripts API 不可使用等情况
      runtimeGlobal.registerState = count === 1 ? RuntimeRegisterCode.REGISTER_DONE : RuntimeRegisterCode.UNSET;
    }
  }

  async updateResourceOnScriptChange(script: Script) {
    if (script.type !== SCRIPT_TYPE_NORMAL || script.status !== SCRIPT_STATUS_ENABLE) {
      throw new Error("Invalid Calling of updateResourceOnScriptChange");
    }
    this.pageLoadCaches.delete(script.uuid);
    // 安装，启用，或earlyStartScript的value更新
    const scriptRes = buildScriptRunResourceBasic(script);
    const patterns = scriptURLPatternResults(scriptRes);
    if (patterns) {
      this.scriptMatchEntry(scriptRes, patterns);
    } else {
      void this.applyScriptMatchInfo(scriptRes);
    }
    const ret = await this.buildCompiledResourceFromScript(script, true);
    if (!ret) {
      // 空匹配覆盖（match 与 include 均为空）时脚本不再匹配任何站点。内存 matcher 里只剩
      // 供 Popup 恢复用的原始规则，这里再清掉持久化的 CompiledResource 并注销浏览器旧注册，
      // 否则 SW 重启后 waitInit 会信任旧资源、让旧范围复活。
      await this.compiledResourceDAO.delete(script.uuid);
      await this.unregistryPageScripts([script.uuid]);
      return;
    }
    const { apiScript } = ret;
    if (await this.loadPageScript(script, apiScript!)) {
      try {
        await this.compiledResourceDAO.save(ret.compiledResource);
      } catch (e) {
        this.logger.error("save compiled resource after registration failed", { uuid: script.uuid }, Logger.E(e));
      }
    }
  }

  public async pushValueUpdate(script: Script, sendData: ValueUpdateDataEncoded) {
    try {
      // 前台腳本 （推送值到tab）
      await deliveryStorage!.set({
        valueUpdateDelivery: {
          rId: `${Date.now()}.${Math.random()}`, // 用于区分不同的更新，确保 deliveryStorage.onChanged 必能触发
          sendData,
        },
      });
      // USER_SCRIPT 看不到 scripting world 的页面广播，改经原生扩展连接投递同一份编码 DTO。
      this.sendUserScriptMessage(undefined, "runtime/valueUpdate", sendData);

      // 後台腳本
      if (bgScriptStorageNames.has(sendData.storageName)) {
        // 推送到offscreen中
        await sendMessage(this.msgSender, "offscreen/runtime/valueUpdate", sendData);
      }

      // valueUpdate 消息用于 early script 的处理
      if (sendData.valueUpdated) {
        if (
          script.status === SCRIPT_STATUS_ENABLE &&
          isEarlyStartScript(getCombinedMeta(script.metadata, script.selfMetadata))
        ) {
          // 如果是预加载脚本，需要更新脚本代码重新注册
          // scriptMatchInfo 里的 value 改变 => compileInjectionCode -> injectionCode 改变
          await this.updateResourceOnScriptChange(script);
        }
      }
    } catch (e) {
      this.logger.error(
        "push value update failed",
        { uuid: script.uuid, storageName: sendData.storageName },
        Logger.E(e)
      );
    }
  }

  async setSessionAccessLevel() {
    try {
      // 让 scripting 存取 chrome.storage.session
      await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
    } catch (e) {
      this.logger.error("set session storage access level failed", Logger.E(e));
    }
  }

  init() {
    if (deliveryStorage === chrome.storage.session) {
      this.setSessionAccessLevel();
    }
    // 启动gm api
    const permission = new PermissionVerify(this.group.group("permission"), this.mq);
    this.gmApi = new GMApi(
      this.systemConfig,
      permission,
      this.group,
      this.msgSender,
      this.mq,
      this.value,
      new GMExternalDependencies(this),
      this.resolvePageExecutionBinding.bind(this)
    );
    permission.init();
    this.gmApi.start();

    this.group.on("stopScript", this.stopScript.bind(this));
    this.group.on("runScript", this.runScript.bind(this));
    this.group.on("pageLoad", this.pageLoad.bind(this));
    this.group.on("pageShow", this.pageShow.bind(this));
    this.group.on("registerUserScript", this.registerUserScriptConnection.bind(this));
    this.group.on("reconnectUserScript", this.reconnectUserScript.bind(this));

    // 监听脚本开启
    this.mq.subscribe<TEnableScript[]>("enableScripts", async (data) => {
      // 所有脚本集合/匹配器的变更都必须先同步失效运行时缓存。
      // 数据库写入发生在队列事件之前，因此此处之后的任何懒重建都能读到最新状态。
      this.invalidateDisabledMatcher();
      for (const { uuid } of data) {
        this.deleteScriptRuntimeCache(uuid);
      }

      const unregisterUuids = [] as string[];
      for (const { uuid, enable } of data) {
        this.revokePageBindingsForScript(uuid);
        const script = await this.scriptDAO.get(uuid);
        if (!script) {
          this.logger.error("script enable failed, script not found", {
            uuid: uuid,
          });
          continue;
        }
        if (enable !== (script.status === SCRIPT_STATUS_ENABLE)) {
          // 防止启用停止状态冲突
          this.logger.error("script enable status conflicts", {
            uuid: uuid,
          });
          continue;
        }
        // 如果是普通脚本, 在service worker中进行注册
        // 如果是后台脚本, 在offscreen中进行处理
        // 脚本类别不会更改
        if (script.type === SCRIPT_TYPE_NORMAL) {
          // 加载页面脚本
          if (enable) {
            await this.updateResourceOnScriptChange(script);
          } else {
            this.scriptMatchEnable.clearRules(uuid);
            this.scriptMatchEnable.clearRules(this.getOriginalMatchUuid(uuid));
            unregisterUuids.push(uuid);
          }
        }
      }
      await this.unregistryPageScripts(unregisterUuids);
    });

    // 监听脚本安装
    this.mq.subscribe<TInstallScript>("installScript", async (data) => {
      const uuid = data.script.uuid;
      this.revokePageBindingsForScript(uuid);
      this.invalidateDisabledMatcher();
      this.deleteScriptRuntimeCache(uuid);

      const script = await this.scriptDAO.get(uuid);
      if (!script) {
        this.logger.error("script install failed, script not found", {
          uuid,
        });
        return;
      }
      this.updateSorter((next) => {
        this.setScriptSort(next, script);
      });
      // 代码更新时脚本类别不会更改
      if (script.type === SCRIPT_TYPE_NORMAL) {
        const enable = script.status === SCRIPT_STATUS_ENABLE;
        if (enable) {
          await this.updateResourceOnScriptChange(script);
        } else {
          // 禁用脚本不再预建 CompiledResource，也不写入 SW 匹配器；
          // Popup 会按需从脚本 metadata 懒构建禁用脚本的 URL 匹配模式。
          this.scriptMatchEnable.clearRules(uuid);
          this.scriptMatchEnable.clearRules(this.getOriginalMatchUuid(uuid));
        }
      } else {
        bgScriptStorageNames.add(getStorageName(script));
      }
    });

    // 监听脚本删除
    this.mq.subscribe<TDeleteScript[]>("trashScripts", async (data) => {
      // 显式提前失效，确保在任何 await 之前就清掉陈旧的 disabled 匹配器。
      // 虽然下方 updateSorter() 内部也会调用 invalidateDisabledMatcher()，但此处与 installScript 保持一致：
      // 由于 updateSorter() 位于 await 之后，必须先在最前面显式失效一次。
      this.invalidateDisabledMatcher();
      const unregisterUuids = [] as string[];
      this.updateSorter((next) => {
        for (const { uuid } of data) {
          this.revokePageBindingsForScript(uuid);
          unregisterUuids.push(uuid);
          this.deleteScriptRuntimeCache(uuid);
          this.deleteScriptSort(next, uuid);
          this.scriptMatchEnable.clearRules(uuid);
          this.scriptMatchEnable.clearRules(this.getOriginalMatchUuid(uuid));
        }
      });
      await this.unregistryPageScripts(unregisterUuids);
    });

    // 监听脚本排序
    this.mq.subscribe<TSortedScript[]>("sortedScripts", async (scripts) => {
      this.updateSorter((next) => {
        for (const script of scripts) {
          this.setScriptSort(next, script);
        }
      });
    });

    // 只有 sandbox 自己确认通道已就绪后才发送初始化状态；fallback 仅解除父层等待，不能承载消息。
    this.mq.subscribe("preparationOffscreen", this.handlePreparationOffscreen.bind(this));

    if (chrome.extension.inIncognitoContext) {
      this.systemConfig.addListener("enable_script_incognito", async (enable) => {
        // 隐身窗口不对注册了的脚本进行实际操作
        // 在pageLoad时，根据isLoadScripts进行判断
        this.isLoadScripts = enable && (await this.systemConfig.getEnableScriptNormal());
      });
      this.systemConfig.addListener("enable_script", async (enable) => {
        // 隐身窗口不对注册了的脚本进行实际操作
        // 当主窗口的enable改为false时，isLoadScripts也会更改为false
        this.isLoadScripts = enable && (await this.systemConfig.getEnableScriptIncognito());
      });
    } else {
      this.systemConfig.addListener("enable_script", async (enable) => {
        this.isLoadScripts = enable;
        await this.unregisterUserscripts();
        if (enable) {
          await this.registerUserscripts();
        }
        this.updateIcon();
      });
    }

    this.systemConfig.addListener("blacklist", async (blacklist: string) => {
      this.blacklist = obtainBlackList(blacklist);
      this.loadBlacklist();
      await this.unregisterUserscripts();
      if (this.isUserScriptsAvailable && this.isLoadScripts) {
        // 重新注册用户脚本；注册是会用加入 blacklistExcludeMatches 和 blacklistExcludeGlobs
        await this.registerUserscripts();
      }
      this.logger.info("blacklist updated", {
        blacklist,
      });
    });

    const onUserScriptAPIGrantAdded = async () => {
      this.isUserScriptsAvailable = true;
      // 注册脚本
      if (this.isLoadScripts) {
        await this.unregisterUserscripts();
        await this.registerUserscripts();
      }
      this.updateIcon();
    };

    const onUserScriptAPIGrantRemoved = async () => {
      this.isUserScriptsAvailable = false;
      // 取消当前注册 （如有）
      await this.unregisterUserscripts();
      this.updateIcon();
    };

    chrome.permissions.onAdded.addListener((permissions: chrome.permissions.Permissions) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.permissions.onAdded:", lastError);
        return;
      }
      if (permissions.permissions?.includes("userScripts")) {
        // Firefox 或其他浏览器或需要手动启动 optional_permission
        // 启动后注册脚本，不需重启扩充
        onUserScriptAPIGrantAdded();
      }
    });

    chrome.permissions.onRemoved.addListener((permissions: chrome.permissions.Permissions) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.permissions.onRemoved:", lastError);
        return;
      }
      if (permissions.permissions?.includes("userScripts")) {
        // 虽然在目前设计中未有使用 permissions.remove
        // 仅保留作为未来之用
        onUserScriptAPIGrantRemoved();
      }
    });

    // ======== 以下初始化是异步处理，因此扩充载入时可能会优先跑其他同步初始化 ========

    // waitInit 优先处理 （包括处理重启问题）
    this.loadingInitProcessPromise = this.waitInit();

    this.initReady = (async () => {
      // 取得初始值 或 等待各种异步同时进行的初始化 (_1, _2, ...)
      const [isUserScriptsAvailable, isLoadScripts, strBlacklist, _1, _2] = await Promise.all([
        checkUserScriptsAvailable(),
        this.systemConfig.getEnableScript(),
        this.systemConfig.getBlacklist(),
        this.loadingInitProcessPromise, // 初始化程序等待
        this.initUserAgentData(), // 初始化：userAgentData
      ]);

      // 保存初始值
      this.isUserScriptsAvailable = isUserScriptsAvailable;
      this.isLoadScripts = isLoadScripts;
      this.blacklist = obtainBlackList(strBlacklist);

      // 更新 logo
      this.updateIcon();

      // 检查是否开启了开发者模式
      if (!this.isUserScriptsAvailable) {
        // 未开启加上警告引导
        this.showUserscriptActivationGuide();
        let cid: ReturnType<typeof setInterval> | number;
        cid = setInterval(async () => {
          if (!this.isUserScriptsAvailable) {
            // 注：optional permission 的设计会触发 chrome.permissions.onAdded
            //     this.isUserScriptsAvailable 自动转为 true, 不需要检测
            try {
              const scriptId = `undefined-test-${Date.now()}`;
              await chrome.userScripts.register([
                {
                  id: scriptId,
                  js: [{ code: "void 0;" }],
                  matches: ["https://not-found.scriptcat.org/"],
                  world: "USER_SCRIPT",
                },
              ]);
              await chrome.userScripts.unregister({ ids: [scriptId] });
            } catch (_e) {
              // 预期出错，不执行后续
              return;
            }
          }
          clearInterval(cid);
          cid = 0;
          // 主要针对 Allow User Scripts 设计
          chrome.runtime.reload();
        }, 500);
      }

      // 初始化：加载黑名单
      this.loadBlacklist();

      // 或许能加快PageLoad的载入速度。subframe 的 URL 不捕捉。
      setOnTabURLChanged((newUrl: string) => {
        if (!this.isUrlBlacklist(newUrl)) {
          this.scriptMatchEnable.urlMatch(newUrl);
        }
      });

      // 注册脚本
      await this.initialCompiledResourcePromise; // 先等待 CompiledResource 完成避免注册时重复生成
      await this.registerUserscripts();

      this.initReady = true;

      // 初始化完成
      return true;
    })();
  }

  updateIcon() {
    const enableUserscript: boolean = this.isUserScriptsAvailable && this.isLoadScripts;
    const iconUrl = enableUserscript
      ? chrome.runtime.getURL("assets/logo-32.png") // 设置正常logo
      : chrome.runtime.getURL("assets/logo-gray-32.png"); // 如果未启用脚本，设置灰色的logo
    chrome.action.setIcon(
      {
        path: { "32": iconUrl },
      },
      () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.action.setIcon:", lastError);
        }
      }
    );
  }

  public loadBlacklist() {
    // 设置黑名单match
    const blacklist = this.blacklist; // 重用cache的blacklist阵列 (immutable)

    const rules = extractUrlPatterns([...blacklist.map((e) => `@include ${e}`)]);
    this.blackMatch.clearRules("BK");
    this.blackMatch.addRules("BK", rules);

    // 黑名单排除
    const excludeMatches = [];
    const excludeGlobs = [];
    for (const rule of rules) {
      if (rule.ruleType === RuleType.MATCH_INCLUDE) {
        // matches -> excludeMatches
        excludeMatches.push(rule.patternString);
      } else if (rule.ruleType === RuleType.GLOB_INCLUDE) {
        // includeGlobs -> excludeGlobs
        excludeGlobs.push(rule.patternString);
      }
    }
    this.blacklistExcludeMatches = excludeMatches;
    this.blacklistExcludeGlobs = excludeGlobs;
  }

  public isUrlBlacklist(url: string) {
    return this.blackMatch.urlMatch(url)[0] === "BK";
  }

  // 取消脚本注册
  async unregisterUserscripts() {
    this.pageExecutionBindings.clear();
    this.userScriptSessions.clear();
    for (const [key, entry] of this.userScriptConnections) {
      entry.connection.disconnect(true);
      this.userScriptConnections.delete(key);
    }
    // 检查 registered 避免重复操作增加系统开支
    // 已成功注册(true)或是未知有无注册(null)的情况下执行
    if (runtimeGlobal.registerState !== RuntimeRegisterCode.UNREGISTER_DONE) {
      runtimeGlobal.registerState = RuntimeRegisterCode.UNREGISTER_DONE;
      // 重置 flag 避免取消注册失败
      // 即使注册失败，通过重置 flag 可避免错误地呼叫已取消注册的Script
      await Promise.allSettled([chrome.userScripts?.unregister(), chrome.scripting.unregisterContentScripts()]);
    }
  }

  async buildCompiledResourceFromScript(script: Script, withCode: boolean = false) {
    const scriptRes = withCode ? await this.script.buildScriptRunResource(script) : buildScriptRunResourceBasic(script);
    const resourceByType = withCode
      ? scriptRes.resourceByType
      : ((await this.resource.getScriptResourceValueByType(scriptRes)) as TRuntimeResourceByType);
    const resources = resourceByType?.require || scriptRes.resource;
    const resourceUrls = (script.metadata["require"] || []).map((res) => resources[res]?.url).filter((res) => res);
    const patterns = scriptURLPatternResults(scriptRes);
    if (!patterns) return undefined;
    const scriptMatchInfo = this.createMatchInfoEntry(scriptRes, patterns);
    // 生效规则一条 inclusion 都不剩（用户把当前站点从匹配中移除后可能如此）时不能注册：
    // getApiMatchesAndGlobs 对没有 match pattern 的规则集会退回 *://*/*，注册出去等于全站运行。
    if (!scriptMatchInfo.scriptUrlPatterns.some((rule) => rule.ruleType & RuleTypeBit.INCLUSION)) return undefined;

    const res = getUserScriptRegister(scriptMatchInfo);
    const registerScript = res.registerScript;

    let jsCode = "";

    // 过滤掉matches为空的脚本
    if (!registerScript.matches || registerScript.matches.length === 0) {
      this.logger.error("registerScript matches is empty", {
        script: script.name,
        uuid: script.uuid,
      });
      return undefined;
    }

    delete scriptRes.scriptRevision;

    if (!withCode) {
      const scriptCode = await this.script.scriptCodeDAO.get(script.uuid);
      scriptRes.code = scriptCode?.code || "";
      scriptRes.resourceByType = resourceByType;
      scriptRes.resource = resourceByType ? this.mergeRuntimeResourceByType(resourceByType) : {};
    }

    const compiledCode = compileInjectionCode(scriptRes, scriptRes.code, scriptMatchInfo.scriptUrlPatterns);
    const scriptRevision = this.getCompiledScriptRevision(
      scriptRes,
      compiledCode,
      scriptMatchInfo.scriptUrlPatterns,
      script.metadata
    );
    scriptRes.scriptRevision = scriptRevision;
    if (withCode) {
      // compiledCode（哈希输入）是在 scriptRevision 尚未写回前算的，不能直接拿去注册；
      // 普通脚本和 early-start 脚本都要在这里补一次编译，让最终注册的 wrapper 带上刚算出的 revision。
      registerScript.js![0].code = jsCode = compileInjectionCode(
        scriptRes,
        scriptRes.code,
        scriptMatchInfo.scriptUrlPatterns
      );
    }

    const scriptUrlPatterns = scriptMatchInfo.scriptUrlPatterns;
    const originalUrlPatterns = scriptMatchInfo.originalUrlPatterns;
    const result = {
      flag: scriptRes.flag,
      name: script.name,
      scriptRevision,
      require: resourceUrls, // 仅储存url
      uuid: script.uuid,
      matches: registerScript.matches || [],
      includeGlobs: registerScript.includeGlobs || [],
      excludeMatches: registerScript.excludeMatches || [],
      excludeGlobs: registerScript.excludeGlobs || [],
      allFrames: registerScript.allFrames || false,
      world: registerScript.world || "",
      runAt: registerScript.runAt || "",
      scriptUrlPatterns: scriptUrlPatterns,
      originalUrlPatterns: scriptUrlPatterns === originalUrlPatterns ? null : originalUrlPatterns,
    } as CompiledResource;

    return { compiledResource: result, jsCode, apiScript: registerScript, scriptRes, patterns };
  }

  private getCompiledScriptRevision(
    scriptRes: ScriptRunResource,
    compiledCode: string,
    scriptUrlPatterns: URLRuleEntry[],
    originalMetadata: SCMetadata = scriptRes.originalMetadata
  ) {
    const resourceByType = scriptRes.resourceByType as TRuntimeResourceByType | undefined;
    const resources = Object.entries(resourceByType || { require: scriptRes.resource })
      .flatMap(([type, byKey]) =>
        Object.entries(byKey || {}).map(([key, resource]) => [
          type,
          key,
          resource.url,
          resource.content,
          resource.base64 || "",
          resource.contentType,
        ])
      )
      .sort(([typeA, keyA], [typeB, keyB]) => {
        const left = `${typeA}:${keyA}`;
        const right = `${typeB}:${keyB}`;
        return left < right ? -1 : left > right ? 1 : 0;
      });
    return sha256OfText(
      JSON.stringify({
        compiledCode,
        metadata: scriptRes.metadata,
        originalMetadata,
        selfMetadata: scriptRes.selfMetadata || null,
        scriptUrlPatterns,
        requiredResources: resources,
      })
    );
  }

  // 从CompiledResource中还原脚本代码
  async restoreJSCodeFromCompiledResource(script: Script, result: CompiledResource) {
    // 用户在设置面板改运行时机只写 selfMetadata，脚本自带 metadata 不变，
    // 所以编译分支必须按合并后的生效 metadata 选，否则重新注册会丢掉覆写（#1649）
    const metadata = getCombinedMeta(script.metadata, script.selfMetadata);

    // 如果是 Scriptlet (unwrap) 脚本，需要另外的处理方式
    if (isScriptletUnwrap(metadata)) {
      const scriptRes = await this.script.buildScriptRunResource(script);
      if (!scriptRes) return "";
      return compileScriptletCode(scriptRes, scriptRes.code, result.scriptUrlPatterns);
    }

    // 如果是预加载脚本，需要另外的处理方式
    if (isEarlyStartScript(metadata)) {
      const scriptRes = await this.script.buildScriptRunResource(script);
      if (!scriptRes) return "";
      scriptRes.scriptRevision = result.scriptRevision;
      return compileInjectionCode(scriptRes, scriptRes.code, result.scriptUrlPatterns);
    }

    const originalCode = await this.script.scriptCodeDAO.get(result.uuid);
    const require: CompileScriptCodeResource["require"] = [];
    for (const requireUrl of result.require) {
      const res = await this.resource.resourceDAO.get(requireUrl);
      if (res) {
        require.push({ url: res.url, content: res.content });
      }
    }

    return compileInjectScriptByFlag(
      result.flag,
      compileScriptCodeByResource({
        name: result.name,
        code: originalCode?.code || "",
        require,
        isContextMenu: isContextMenuScript(metadata),
      }),
      false,
      result.uuid
    );
  }

  async getParticularScriptList({
    excludeMatches,
    excludeGlobs,
  }: {
    excludeMatches: string[];
    excludeGlobs: string[];
  }) {
    const list = await this.scriptDAO.all();
    // 按照脚本顺序位置排序
    list.sort((a, b) => a.sort - b.sort);
    const compiledResourceCandidates = new Map<
      string,
      NonNullable<Awaited<ReturnType<RuntimeService["buildCompiledResourceFromScript"]>>>
    >();
    const registerScripts = await Promise.all(
      list.map(async (script) => {
        if (script.type !== SCRIPT_TYPE_NORMAL || script.status !== SCRIPT_STATUS_ENABLE) {
          return undefined;
        }
        const candidate = await this.buildCompiledResourceFromScript(script, true);
        if (!candidate) return undefined;
        compiledResourceCandidates.set(script.uuid, candidate);
        const registerScript = candidate.apiScript;
        registerScript.excludeMatches = [...(registerScript.excludeMatches || []), ...excludeMatches];
        registerScript.excludeGlobs = [...(registerScript.excludeGlobs || []), ...excludeGlobs];
        return registerScript;
      })
    ).then(async (res) => {
      // 过滤掉undefined和未开启的
      return res.filter((item) => item) as chrome.userScripts.RegisteredUserScript[];
    });
    return {
      registerScripts,
      compiledResourceCandidates: [...compiledResourceCandidates.values()],
    };
  }

  // 获取content.js和inject.js的脚本注册信息
  async getContentAndInjectScript({
    excludeMatches,
    excludeGlobs,
  }: {
    excludeMatches: string[];
    excludeGlobs: string[];
  }) {
    // 配置脚本运行环境: 注册时前先准备 chrome.runtime 等设定
    // Firefox MV3 只提供 runtime.sendMessage 及 runtime.connect
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts/WorldProperties#messaging
    try {
      await chrome.userScripts.configureWorld({
        csp: "script-src 'self' 'unsafe-inline' 'unsafe-eval' *",
        messaging: true,
      });
    } catch (_e) {
      try {
        await chrome.userScripts.configureWorld({
          messaging: true,
        });
      } catch (e) {
        this.logger.error("configure userScripts world failed", Logger.E(e));
      }
    }

    let retContent: chrome.scripting.RegisteredContentScript[] = [];
    const retInject: chrome.userScripts.RegisteredUserScript[] = [];

    // ------ scripting.js ------
    // Note: Chrome does not support file.js?query
    // 注意：Chrome 不支持 file.js?query
    retContent = [
      {
        id: "scriptcat-scripting",
        js: ["/src/scripting.js"],
        matches: ["<all_urls>"],
        allFrames: true,
        runAt: "document_start",
        excludeMatches,
      } satisfies chrome.scripting.RegisteredContentScript,
    ];

    // ------ inject.js & content.js ------
    const jsonUAD = JSON.stringify(this.userAgentData);
    const injectJs = await this.getInjectJsCode();
    if (injectJs) {
      // 构建inject.js的脚本注册信息
      const codeBody = `(function (UserAgentData) {\n${injectJs}\n})(${jsonUAD})`;
      const code = `${codeBody}${sourceMapTo("scriptcat-inject.js")}\n`;
      const script = {
        id: "scriptcat-inject",
        js: [{ code }],
        matches: ["<all_urls>"],
        allFrames: true,
        runAt: "document_start",
        excludeMatches: excludeMatches,
        excludeGlobs: excludeGlobs,
        world: "MAIN",
      } satisfies chrome.userScripts.RegisteredUserScript;
      retInject.push(script);
    }
    const contentJs = await this.getContentJsCode();
    if (contentJs) {
      // 构建 content.js 的脚本注册信息
      const codeBody = `(function (UserAgentData) {\n${contentJs}\n})(${jsonUAD})`;
      const code = `${codeBody}${sourceMapTo("scriptcat-content.js")}\n`;
      const script = {
        id: "scriptcat-content",
        js: [{ code }],
        matches: ["<all_urls>"],
        allFrames: true,
        runAt: "document_start",
        excludeMatches,
        excludeGlobs,
        world: "USER_SCRIPT",
      } satisfies chrome.userScripts.RegisteredUserScript;
      retInject.push(script);
    }

    return { content: retContent, inject: retInject };
  }

  // 如果是重复注册，需要先调用 unregisterUserscripts
  async registerUserscripts() {
    // 若 UserScripts API 不可使用 或 ScriptCat设定为不启用脚本 则退出
    if (!this.isUserScriptsAvailable || !this.isLoadScripts) return;

    // 判断是否已经注册过
    if (runtimeGlobal.registerState === RuntimeRegisterCode.REGISTER_DONE) {
      // 异常情况
      // 检查scriptcat-content和scriptcat-inject是否存在
      const res = await chrome.userScripts.getScripts({ ids: ["scriptcat-inject"] });
      const contentScripts = await chrome.scripting.getRegisteredContentScripts({ ids: ["scriptcat-scripting"] });
      if (res.length === 1 && contentScripts.length === 1) {
        return;
      }
      // scriptcat-content/scriptcat-inject不存在的情况
      // 走一次重新注册的流程
      this.logger.warn("registered = true but scriptcat-content/scriptcat-inject not exists, re-register userscripts.");
      runtimeGlobal.registerState = RuntimeRegisterCode.UNSET; // 异常时强制反注册
    }
    // 删除旧注册
    await this.unregisterUserscripts();
    // 使注册时重新注入 chrome.runtime
    try {
      await chrome.userScripts.resetWorldConfiguration();
    } catch (e: any) {
      this.logger.error("reset userScripts world configuration failed", Logger.E(e));
    }

    const options = {
      excludeMatches: this.blacklistExcludeMatches,
      excludeGlobs: this.blacklistExcludeGlobs,
    };

    const { registerScripts: particularScriptList, compiledResourceCandidates } =
      await this.getParticularScriptList(options);
    // getContentAndInjectScript依赖loadScriptMatchInfo
    // 需要等getParticularScriptList完成后再执行
    const { inject: injectScriptList, content: contentScriptList } = await this.getContentAndInjectScript(options);

    const list: chrome.userScripts.RegisteredUserScript[] = [...particularScriptList, ...injectScriptList];

    let failed = false;
    const registeredScriptIds = new Set<string>();
    try {
      await chrome.userScripts.register(list);
      for (const candidate of compiledResourceCandidates) {
        if (candidate) registeredScriptIds.add(candidate.compiledResource.uuid);
      }
    } catch (e: any) {
      this.logger.error("batch registration error", Logger.E(e));
      // 批量注册失败则退回单个注册
      for (const script of list) {
        try {
          await chrome.userScripts.register([script]);
          registeredScriptIds.add(script.id);
        } catch (e: any) {
          if (e.message?.includes("Duplicate script ID")) {
            // 如果是重复注册, 则更新
            try {
              await chrome.userScripts.update([script]);
              registeredScriptIds.add(script.id);
            } catch (e) {
              failed = true;
              this.logger.error("update error", Logger.E(e));
            }
          } else {
            this.logger.error("register error", Logger.E(e));
          }
        }
      }
    }
    for (const candidate of compiledResourceCandidates) {
      if (!candidate || !registeredScriptIds.has(candidate.compiledResource.uuid)) continue;
      this.scriptMatchEntry(candidate.scriptRes, candidate.patterns);
      try {
        await this.compiledResourceDAO.save(candidate.compiledResource);
      } catch (e) {
        this.logger.error(
          "save compiled resource after registration failed",
          { uuid: candidate.compiledResource.uuid },
          Logger.E(e)
        );
      }
    }
    if (contentScriptList.length > 0) {
      try {
        await chrome.scripting.registerContentScripts(contentScriptList);
      } catch (e: any) {
        failed = true;
        this.logger.error("register content.js error", Logger.E(e));
      }
    }
    runtimeGlobal.registerState = failed ? RuntimeRegisterCode.UNSET : RuntimeRegisterCode.REGISTER_DONE;
  }

  // 给指定脚本触发事件
  emitEventToTab(to: ExtMessageSender, req: EmitEventRequest) {
    if (to.tabId === -1) {
      // 如果是-1, 代表给offscreen发送消息
      return sendMessage(this.msgSender, "offscreen/runtime/emitEvent", req);
    }
    this.sendUserScriptMessage(to, "runtime/emitEvent", req);
    return sendMessage(
      new ExtensionContentMessageSend(to.tabId, {
        documentId: to.documentId,
        frameId: to.frameId,
      }),
      "scripting/runtime/emitEvent",
      req
    );
  }

  getPageScriptMatchingResultByUrl(url: string, includeNonEffective: boolean = false) {
    return this.getPageScriptMatchingResultByUrlInternal(url, undefined, includeNonEffective);
  }

  /**
   * 仅供内部调用：构建过程含 await，需配合 disabledMatcherVersion 做完整性校验（见 getDisabledMatcher）。
   * 仅从数据库与脚本 metadata 构建禁用脚本匹配器，不依赖预建的 CompiledResource。
   */
  private async buildDisabledMatcher() {
    const matcher = new UrlMatch<string>();
    matcher.setupSorter(this.sorter);
    const scripts = await this.scriptDAO.all();
    for (const script of scripts) {
      if (script.type !== SCRIPT_TYPE_NORMAL || script.status !== SCRIPT_STATUS_DISABLE) continue;
      const patterns = this.getOrBuildPatternCache(buildScriptRunResourceBasic(script));
      if (!patterns) continue;
      const uuidOri = this.getOriginalMatchUuid(script.uuid);
      matcher.addRules(script.uuid, patterns.scriptUrlPatterns);
      if (patterns.originalUrlPatterns !== patterns.scriptUrlPatterns) {
        matcher.addRules(uuidOri, patterns.originalUrlPatterns);
      }
    }
    return matcher;
  }

  // 懒构建并缓存禁用脚本匹配器。stackAsyncTask 按 key 串行执行，确保并发的 Popup 请求共享同一次构建。
  private getDisabledMatcher(): Promise<UrlMatch<string>> {
    return stackAsyncTask<UrlMatch<string>>(this.disabledMatcherTaskKey, async () => {
      let matcher = this.disabledMatcher;
      if (matcher) return matcher; // 已有缓存直接返回
      let buildVersion;
      do {
        // 记录开工时的版本号；若构建期间发生脚本事件（版本号被 invalidateDisabledMatcher 改变），
        // 说明本次快照已过时，需丢弃并重建，避免 Popup 显示到刚被删除/改动的脚本。
        buildVersion = this.disabledMatcherVersion;
        matcher = await this.buildDisabledMatcher();
      } while (this.disabledMatcherVersion !== buildVersion);
      return (this.disabledMatcher = matcher);
    });
  }

  async getPopupPageScriptMatchingResultByUrl(url: string) {
    const disabledMatcher = await this.getDisabledMatcher();
    return this.getPageScriptMatchingResultByUrlInternal(url, disabledMatcher, true);
  }

  private getPageScriptMatchingResultByUrlInternal(
    url: string,
    disabledMatcher: UrlMatch<string> | undefined,
    includeNonEffective: boolean
  ) {
    // 返回当前页面匹配的uuids
    // 如果有使用自定义排除，原本脚本定义的会返回 uuid{Ori}
    // 因此基于自定义排除页面被排除的情况下，结果只包含 uuid{Ori} 而不包含 uuid
    const matchedUuids = disabledMatcher
      ? [...this.scriptMatchEnable.urlMatch(url!), ...disabledMatcher.urlMatch(url!)]
      : this.scriptMatchEnable.urlMatch(url!);
    const ret = new Map<string, { uuid: string; effective: boolean }>();
    for (const e of matchedUuids) {
      const uuid = e.endsWith(ORIGINAL_URLMATCH_SUFFIX) ? e.slice(0, -ORIGINAL_URLMATCH_SUFFIX.length) : e;
      if (!includeNonEffective && uuid !== e) continue;
      const o = ret.get(uuid) || { uuid, effective: false };
      // 只包含 uuid{Ori} 而不包含 uuid 的情况，effective = false
      if (e === uuid) {
        o.effective = true;
      }
      ret.set(uuid, o);
    }
    // ret 只包含 uuid 为键的 matchingResult
    return ret;
  }

  async updateSites() {
    if (this.sitesLoaded.size === 0 || this.updateSitesBusy) return;
    this.updateSitesBusy = true;
    const list = [...this.sitesLoaded];
    this.sitesLoaded.clear();
    const currentSites = (await this.localStorageDAO.getValue<ScriptSite>("sites")) || ({} as ScriptSite);
    const sets: Partial<Record<string, Set<string>>> = {};
    for (const str of list) {
      const [uuid, domain] = str.split("|");
      const s = sets[uuid] || (sets[uuid] = new Set([] as string[]));
      s.add(domain);
    }
    for (const uuid in sets) {
      const s = new Set([...sets[uuid]!, ...(currentSites[uuid] || ([] as string[]))]);
      const arr = (currentSites[uuid] = [...s]);
      if (arr.length > 50) arr.length = 50;
    }
    await this.localStorageDAO.saveValue("sites", currentSites);
    this.updateSitesBusy = false;
    if (this.sitesLoaded.size > 0) {
      Promise.resolve().then(() => this.updateSites());
    }
  }

  async pageLoad(data: { envTag?: "it" | "ct" } | undefined, sender: IGetSender): Promise<TClientPageLoadInfo> {
    // USER_SCRIPT 只能通过一次性 bootstrap 获取 content-world 资料，不能自行请求 pageLoad。
    if (sender.getConnectOrigin?.() === "userScript") return { ok: false };
    const chromeSender = sender.getSender();
    const url = chromeSender?.url;
    if (!url) {
      // 异常加载
      return { ok: false };
    }
    const tabId = chromeSender.tab?.id ?? -1;
    const frameId = chromeSender.frameId;
    const incognito = chromeSender.tab?.incognito ?? false;
    const pageLoadSequence = this.beginPageLoadSequence(sender, data?.envTag);
    const res = await this.getScriptsForTab({ url, tabId, frameId, incognito });
    if (pageLoadSequence && this.pageLoadSequences.get(pageLoadSequence[0]) !== pageLoadSequence[1]) {
      return { ok: false };
    }

    // 即使新 URL 没有匹配脚本也要退休旧绑定，关闭不提供 documentId 的浏览器复用窗口。
    this.revokePageBindings(sender, data?.envTag);

    this.mq.emit<TPopupPageLoadInfo>("popupPageLoadUpdate", {
      tabId: tabId,
      frameId: frameId,
      url: url,
      scriptmenus: res?.scriptmenus || [], // 对于 popup, resources那些不需要
    });

    if (res) {
      const prepareScripts = (scripts: TScriptInfo[], envTag: "it" | "ct") =>
        scripts.map((script) => {
          const binding = this.issuePageBinding(
            script.uuid,
            envTag,
            getStorageName(script),
            getPageRpcAllowedAPIs(getEffectiveScriptGrants(script.metadata)),
            sender
          );
          return {
            ...script,
            executionHandle: binding.handle,
            executionEnvTag: envTag,
            executionRunFlag: binding.runFlag,
          };
        });
      const injectScriptList = data?.envTag === "ct" ? [] : prepareScripts(res.injectScriptList, "it");
      const contentScriptList = prepareScripts(res.contentScriptList, "ct");
      let userScriptBootstrapToken: string | undefined;
      if (data?.envTag === "it" && contentScriptList.length > 0) {
        const token = uuidv4();
        this.userScriptBootstraps.set(token, {
          scripts: contentScriptList,
          envInfo: res.envInfo,
          extensionOrigin: getExtensionOrigin(),
          reconnectToken: token,
          envTag: "ct",
          url,
          tabId,
          frameId,
          documentId: chromeSender.documentId,
          pendingValueUpdates: new Map(),
        });
        userScriptBootstrapToken = token;
      }
      // 返回脚本资料，在页面加载
      return {
        ok: true,
        injectScriptList,
        contentScriptList: data?.envTag === "it" ? [] : contentScriptList,
        envInfo: res.envInfo,
        userScriptBootstrapToken,
      };
    } else {
      // 没有脚本资料，不需要加载
      return { ok: false };
    }
  }
  /**
   * bfcache 还原：文档连同里面已注入的脚本被整体恢复，content script 不会重新执行，
   * 因此不会再走 pageLoad。这里只重新广播一次「本页扩展触及得到」，
   * 绝不能顺带重放脚本——脚本本来就还在页面里跑着。
   */
  async pageShow(_: any, sender: IGetSender) {
    const chromeSender = sender.getSender();
    const url = chromeSender?.url;
    if (!url) return;
    this.mq.emit<TPopupPageRestoreInfo>("popupPageRestored", {
      tabId: chromeSender.tab?.id ?? -1,
      frameId: chromeSender.frameId,
      url,
    });
  }

  private shouldSkipPageLoadScript(
    scriptRes: ScriptRunResource,
    frameId: number | undefined,
    incognito: boolean = false
  ) {
    // 判断脚本是否开启
    if (scriptRes.status === SCRIPT_STATUS_DISABLE) {
      return true;
    }
    // 判断注入页面类型
    if (scriptRes.metadata["run-in"]) {
      const runIn = scriptRes.metadata["run-in"][0];
      if (runIn !== "all") {
        // 判断插件运行环境
        const contextType = incognito ? "incognito-tabs" : "normal-tabs";
        if (runIn !== contextType) {
          return true;
        }
      }
    }
    // 如果是iframe,判断是否允许在iframe里运行
    if (frameId && scriptRes.metadata.noframes) {
      return true;
    }
    return false;
  }

  private getPageLoadScriptCacheKey(scriptRes: ScriptRunResource) {
    const { status, type, updatetime, metadata } = scriptRes;
    // 代码/原始 metadata/userConfig/资源变化时，主要靠事件处理器（enable/install/delete）失效缓存。
    // 此缓存键只是低成本的兜底：用于 selfMetadata 修改 match/include/exclude 这类「合并后 metadata 变了
    // 但不一定 bump updatetime」的情况。
    return `${status}:${type}:${updatetime || 0}~${JSON.stringify([metadata.match, metadata.include, metadata.exclude])}`;
  }

  private getCodeCacheKey(script: Script) {
    return `${script.createtime}:${script.updatetime || 0}`;
  }

  private async getScriptInfoForCode(script: Script): Promise<TCodeCache | undefined> {
    const cacheKey = this.getCodeCacheKey(script);
    const cached = this.codeCacheMap.get(script.uuid);
    if (cached?.cacheKey === cacheKey) {
      return cached;
    }
    const code = await this.scriptDAO.scriptCodeDAO.get(script.uuid);
    if (!code) return undefined;
    const metadataStr = getMetadataStr(code.code) || "";
    const userConfigStr = getUserConfigStr(code.code) || "";
    const userConfig = parseUserConfig(userConfigStr) || undefined;
    const info = { cacheKey, code: code.code, metadataStr, userConfigStr, userConfig } satisfies TCodeCache;
    this.codeCacheMap.set(script.uuid, info);
    return info;
  }

  private cloneRuntimeResource(resource: Record<string, TRuntimeResource>) {
    const ret: Record<string, TRuntimeResource> = {};
    for (const [name, res] of Object.entries(resource)) {
      ret[name] = { ...res };
      // 删除base64以节省资源。如果有content就删除base64。
      if (ret[name].content) {
        ret[name].base64 = undefined;
      }
    }
    return ret;
  }

  private cloneRuntimeResourceByType(resourceByType: TRuntimeResourceByType): TRuntimeResourceByType {
    return {
      require: this.cloneRuntimeResource(resourceByType.require),
      "require-css": this.cloneRuntimeResource(resourceByType["require-css"]),
      resource: this.cloneRuntimeResource(resourceByType.resource),
    };
  }

  private mergeRuntimeResourceByType(resourceByType: TRuntimeResourceByType) {
    return {
      ...resourceByType.require,
      ...resourceByType["require-css"],
      ...resourceByType.resource,
    };
  }

  private getLocalResourceCacheList(resourceByType: TRuntimeResourceByType) {
    const localResources: TLocalResourceCache[] = [];
    for (const type of ["require", "require-css", "resource"] as const) {
      for (const [resourceKey, res] of Object.entries(resourceByType[type])) {
        if (res.url.startsWith("file:///")) {
          localResources.push({
            resourceKey,
            url: res.url,
            type,
            sha512: res.hash?.sha512,
          });
        }
      }
    }
    return localResources;
  }

  private async buildPageLoadScriptCache(
    scriptRes: ScriptRunResource,
    compiledResource: CompiledResource,
    scriptCacheKey: string,
    originalMetadata: SCMetadata = scriptRes.originalMetadata
  ): Promise<TPageLoadScriptCache | undefined> {
    const [resourceByType, codeInfo] = await Promise.all([
      this.resource.getScriptResourceValueByType(scriptRes) as Promise<TRuntimeResourceByType>,
      this.getScriptInfoForCode(scriptRes),
    ]);
    if (!codeInfo) return undefined;
    const scriptUrlPatterns = compiledResource.scriptUrlPatterns;
    const originalUrlPatterns = compiledResource.originalUrlPatterns;
    this.cachedPatterns.set(scriptRes.uuid, {
      scriptUrlPatterns,
      originalUrlPatterns: originalUrlPatterns === null ? scriptUrlPatterns : originalUrlPatterns,
    });
    return {
      scriptCacheKey,
      scriptRevision: compiledResource.scriptRevision,
      originalMetadata,
      scriptUrlPatterns,
      originalUrlPatterns,
      code: codeInfo.code,
      metadataStr: codeInfo.metadataStr,
      userConfigStr: codeInfo.userConfigStr,
      userConfig: codeInfo.userConfig,
      resourceByType: this.cloneRuntimeResourceByType(resourceByType),
      localResources: this.getLocalResourceCacheList(resourceByType),
    };
  }

  private createPageLoadScriptInfo(scriptRes: ScriptRunResource, cache: TPageLoadScriptCache) {
    const resourceByType = this.cloneRuntimeResourceByType(cache.resourceByType);
    return {
      ...scriptRes,
      scriptRevision: cache.scriptRevision,
      scriptUrlPatterns: cache.scriptUrlPatterns,
      originalUrlPatterns: cache.originalUrlPatterns === null ? cache.scriptUrlPatterns : cache.originalUrlPatterns,
      code: cache.code,
      value: {},
      resource: this.mergeRuntimeResourceByType(resourceByType),
      resourceByType,
      metadataStr: cache.metadataStr,
      userConfigStr: cache.userConfigStr,
      userConfig: cache.userConfig,
    } as ScriptLoadInfo & { scriptUrlPatterns: URLRuleEntry[] };
  }

  private getOrBuildPatternCache(scriptRes: ScriptRunResource) {
    let patterns = this.cachedPatterns.get(scriptRes.uuid);
    if (patterns) return patterns;
    const result = scriptURLPatternResults(scriptRes);
    if (!result) return undefined;
    patterns = {
      scriptUrlPatterns: result.scriptUrlPatterns,
      originalUrlPatterns: result.originalUrlPatterns,
    };
    this.cachedPatterns.set(scriptRes.uuid, patterns);
    return patterns;
  }

  // 每次页面加载都重新拉取 file:/// 本地资源；sha512 未变则跳过。
  private async refreshLocalResourcesForPageLoad(
    enableScriptList: (ScriptLoadInfo & { scriptUrlPatterns: URLRuleEntry[] })[]
  ) {
    const scriptsWithUpdatedResources = new Map<
      string,
      { scriptRes: ScriptLoadInfo & { scriptUrlPatterns: URLRuleEntry[] }; cache: TPageLoadScriptCache }
    >();
    await Promise.all(
      enableScriptList.map(async (scriptRes) => {
        const currentCache = this.pageLoadCaches.get(scriptRes.uuid);
        if (!currentCache?.localResources.length) return;
        const cache: TPageLoadScriptCache = {
          ...currentCache,
          localResources: currentCache.localResources.map((resource) => ({ ...resource })),
          resourceByType: this.cloneRuntimeResourceByType(currentCache.resourceByType),
        };
        const candidate: ScriptLoadInfo & { scriptUrlPatterns: URLRuleEntry[] } = {
          ...scriptRes,
          resourceByType: this.cloneRuntimeResourceByType(scriptRes.resourceByType as TRuntimeResourceByType),
          resource: {},
        };
        candidate.resource = this.mergeRuntimeResourceByType(candidate.resourceByType!);
        let resourceUpdated = false;
        await Promise.all(
          cache.localResources.map(async (localResource) => {
            try {
              // updateResource 需要解析后的 SRI 信息和旧资源：旧资源用于合并 link、下载失败时回退。
              const u = parseUrlSRI(localResource.url);
              const oldResources = await this.resource.getResourceModel(u);
              const updatedResource = await this.resource.updateResource(
                scriptRes.uuid,
                u,
                localResource.type,
                oldResources
              );
              if (!updatedResource || updatedResource.hash?.sha512 === localResource.sha512) return;
              const nextResource = { ...updatedResource } as TRuntimeResource;
              if (nextResource.content) {
                nextResource.base64 = undefined;
              }
              localResource.sha512 = updatedResource.hash?.sha512;
              cache.resourceByType[localResource.type][localResource.resourceKey] = nextResource;
              candidate.resourceByType![localResource.type][localResource.resourceKey] = { ...nextResource };
              candidate.resource[localResource.resourceKey] = { ...nextResource };
              resourceUpdated = true;
            } catch (e) {
              this.logger.error(
                "refresh local resource failed",
                { uuid: scriptRes.uuid, url: localResource.url },
                Logger.E(e)
              );
            }
          })
        );
        if (resourceUpdated) {
          delete candidate.scriptRevision;
          const baseCode = compileInjectionCode(candidate, cache.code, candidate.scriptUrlPatterns);
          cache.scriptRevision = this.getCompiledScriptRevision(
            candidate,
            baseCode,
            candidate.scriptUrlPatterns,
            cache.originalMetadata
          );
          candidate.scriptRevision = cache.scriptRevision;
          scriptsWithUpdatedResources.set(scriptRes.uuid, { scriptRes: candidate, cache });
        }
      })
    );
    return scriptsWithUpdatedResources;
  }

  async getScriptsForTab({ url, frameId, incognito = false }: TTabInfo): Promise<TScriptsForTab> {
    if (!this.isLoadScripts) {
      return null;
    }
    // Firefox spanning 的 event page 是共享的，必须使用消息发送方的 tab.incognito 额外执行隐身总开关。
    if (incognito && !(await this.systemConfig.getEnableScriptIncognito())) {
      return null;
    }

    // 判断是否黑名单（针对网址，与个别脚本设定无关）
    if (this.isUrlBlacklist(url)) {
      // 如果在黑名单中, 则不加载脚本
      return null;
    }

    // 匹配当前页面的脚本（只包含有效脚本。自定义排除了的不包含）
    const matchingResult = this.getPageScriptMatchingResultByUrl(url);

    // 该网址没有任何脚本匹配，包括排除匹配
    if (!matchingResult.size) return null;

    const uuids = [...matchingResult.keys()];
    const scripts = await this.scriptDAO.gets(uuids);
    // 用下标占位收集结果，保证最终列表仍按匹配排序输出（最后再 filter 掉空洞）。
    const enableScriptListByIndex = [] as Array<(ScriptLoadInfo & { scriptUrlPatterns: URLRuleEntry[] }) | undefined>;
    const cacheMisses: Array<{
      index: number;
      script: Script;
      scriptRes: ScriptRunResource;
      scriptCacheKey: string;
    }> = [];

    // 第一趟：能命中页面加载缓存的直接生成；命不中的先收集起来，稍后批量处理。
    for (let idx = 0, l = uuids.length; idx < l; idx++) {
      const script = scripts[idx];
      if (!script) continue;
      const scriptRes = buildScriptRunResourceBasic(script);
      if (this.shouldSkipPageLoadScript(scriptRes, frameId, incognito)) continue;

      const scriptCacheKey = this.getPageLoadScriptCacheKey(scriptRes);
      const cached = this.pageLoadCaches.get(script.uuid);
      if (cached?.scriptCacheKey === scriptCacheKey) {
        enableScriptListByIndex[idx] = this.createPageLoadScriptInfo(scriptRes, cached);
      } else {
        cacheMisses.push({ index: idx, script, scriptRes, scriptCacheKey });
      }
    }

    // 第二趟：只为未命中缓存的脚本批量取 CompiledResource 并并行构建缓存。
    if (cacheMisses.length) {
      const compiledResources = await this.compiledResourceDAO.gets(cacheMisses.map((miss) => miss.script.uuid));
      await Promise.all(
        cacheMisses.map(async (miss, missIndex) => {
          const compiledResource = compiledResources[missIndex];
          if (!compiledResource?.scriptUrlPatterns?.length || !compiledResource.scriptRevision) return;
          const candidate = await this.buildCompiledResourceFromScript(miss.script, true);
          if (candidate?.compiledResource.scriptRevision !== compiledResource.scriptRevision) return;
          const cache = await this.buildPageLoadScriptCache(
            miss.scriptRes,
            compiledResource,
            miss.scriptCacheKey,
            miss.script.metadata
          );
          if (!cache) return;
          this.pageLoadCaches.set(miss.script.uuid, cache);
          enableScriptListByIndex[miss.index] = this.createPageLoadScriptInfo(miss.scriptRes, cache);
        })
      );
    }

    const enableScriptList = enableScriptListByIndex.filter((item) => item !== undefined) as (ScriptLoadInfo & {
      scriptUrlPatterns: URLRuleEntry[];
    })[];

    // 没有任何启用脚本
    if (!enableScriptList.length) return null;

    // 更新资源使用了file协议的脚本
    const scriptsWithUpdatedResources = await this.refreshLocalResourcesForPageLoad(enableScriptList);

    const { value } = this;
    await Promise.all(
      enableScriptList.map(async (script) => {
        // value（GM 值）会在页面间变化，必须每次页面加载都实时读取，绝不能走页面加载缓存。
        script.value = await value.getScriptValue(script);
      })
    );

    if (scriptsWithUpdatedResources.size) {
      let registeredScripts: RegisteredUserScriptWithJsCode[] = [];
      try {
        registeredScripts = (await chrome.userScripts.getScripts({
          ids: [...scriptsWithUpdatedResources.keys()],
        })) as RegisteredUserScriptWithJsCode[];
      } catch (e) {
        this.logger.error("get registered userscripts error", Logger.E(e));
      }
      for (const scriptRegisterInfo of registeredScripts) {
        const { id: uuid } = scriptRegisterInfo;
        const candidate = scriptsWithUpdatedResources.get(uuid);
        if (!candidate) continue;
        const code = compileInjectionCode(
          candidate.scriptRes,
          candidate.cache.code,
          candidate.scriptRes.scriptUrlPatterns
        );
        scriptRegisterInfo.js = [{ code }];
        try {
          await chrome.userScripts.update([scriptRegisterInfo]);
        } catch (e) {
          this.logger.error("update registered userscript error", { uuid }, Logger.E(e));
          continue;
        }

        this.pageLoadCaches.set(uuid, candidate.cache);
        const scriptIndex = enableScriptList.findIndex((script) => script.uuid === uuid);
        if (scriptIndex >= 0) {
          enableScriptList[scriptIndex] = { ...candidate.scriptRes, value: enableScriptList[scriptIndex].value };
        }
        try {
          const compiledResource = await this.compiledResourceDAO.get(uuid);
          if (compiledResource) {
            compiledResource.scriptRevision = candidate.cache.scriptRevision;
            await this.compiledResourceDAO.save(compiledResource);
          }
        } catch (e) {
          this.logger.error("save compiled resource revision failed", { uuid }, Logger.E(e));
        }
      }
    }

    // 发布给 Popup 的信息
    const scriptmenus = enableScriptList.map((script) => scriptToMenu(script));

    let domain = "";
    try {
      const u = url ? new URL(url) : null;
      if (u?.protocol?.startsWith("http")) {
        domain = u.hostname;
      }
    } catch {
      // ignore
    }
    if (domain) {
      for (const script of enableScriptList) {
        this.sitesLoaded.add(`${script.uuid}|${domain}`);
      }
      Promise.resolve().then(() => this.updateSites());
    }

    const injectScriptList: TScriptInfo[] = [];
    const contentScriptList: TScriptInfo[] = [];
    for (const script of enableScriptList) {
      const list = isInjectIntoContent(script.metadata) ? contentScriptList : injectScriptList;
      list.push(trimScriptInfo({ ...script }));
    }

    // 发布给 inject 和 content 的信息
    return {
      injectScriptList: injectScriptList,
      contentScriptList: contentScriptList,
      envInfo: {
        sandboxMode: "raw",
        isIncognito: incognito,
        userAgentData: this.userAgentData ?? undefined,
      } as GMInfoEnv,
      scriptmenus,
    } satisfies TScriptsForTab;
  }

  private async handlePreparationOffscreen(data: { verified: boolean }) {
    if (!data.verified || this.sandboxInitializationReplayed) return;
    this.sandboxInitializationReplayed = true;

    const [list, language] = await Promise.all([this.scriptDAO.all(), this.systemConfig.getLanguage()]);
    const scripts: TEnableScript[] = [];
    for (const script of list) {
      if (script.type === SCRIPT_TYPE_NORMAL) continue;
      bgScriptStorageNames.add(getStorageName(script));
      scripts.push({
        uuid: script.uuid,
        enable: script.status === SCRIPT_STATUS_ENABLE,
      });
    }
    if (scripts.length > 0) {
      this.mq.publish<TEnableScript[]>("enableScripts", scripts);
    }
    this.mq.publish("setSandboxLanguage", language);
    this.systemConfig.addListener("language", (lng) => {
      this.mq.publish("setSandboxLanguage", lng);
    });
  }

  // 停止脚本
  async stopScript(uuid: string) {
    return await stopScript(this.msgSender, uuid);
  }

  // 运行脚本
  async runScript(uuid: string) {
    const res = await this.script.getScriptRunResourceByUUID(uuid);
    if (!res) {
      return;
    }
    return await runScript(this.msgSender, res);
  }

  scriptMatchEntry(
    scriptRes: ScriptRunResource,
    o: {
      scriptUrlPatterns: URLRuleEntry[];
      originalUrlPatterns: URLRuleEntry[];
    }
  ) {
    const { uuid } = scriptRes;
    const { scriptUrlPatterns, originalUrlPatterns } = o;

    const matchInfoEntry = this.createMatchInfoEntry(scriptRes, {
      scriptUrlPatterns: scriptUrlPatterns,
      originalUrlPatterns: originalUrlPatterns === scriptUrlPatterns ? null : originalUrlPatterns,
    });
    const uuidOri = this.getOriginalMatchUuid(uuid);
    this.cachedPatterns.set(uuid, { scriptUrlPatterns, originalUrlPatterns });

    // 这里只负责写入「启用脚本」匹配器（scriptMatchEnable）。禁用脚本刻意不在此写入；
    // Popup 使用的是基于数据库状态、按需懒构建的不可变 disabled 匹配器。
    this.scriptMatchEnable.clearRules(uuid);
    this.scriptMatchEnable.clearRules(uuidOri);
    if (scriptRes.status === SCRIPT_STATUS_ENABLE) {
      this.scriptMatchEnable.addRules(uuid, scriptUrlPatterns);
      if (originalUrlPatterns && originalUrlPatterns !== scriptUrlPatterns) {
        this.scriptMatchEnable.addRules(uuidOri, originalUrlPatterns);
      }
    }
    return matchInfoEntry;
  }

  /**
   * applyScriptMatchInfo 对脚本进行URL匹配信息的处理
   */
  async applyScriptMatchInfo(scriptRes: ScriptRunResource) {
    const o = scriptURLPatternResults(scriptRes);
    if (!o) {
      const { uuid } = scriptRes;
      this.scriptMatchEnable.clearRules(uuid);
      this.scriptMatchEnable.clearRules(this.getOriginalMatchUuid(uuid));
      this.cachedPatterns.delete(uuid);
      return undefined;
    }
    // 构建脚本匹配信息
    return this.scriptMatchEntry(scriptRes, o);
  }

  // 加载页面脚本, 会把脚本信息放入缓存中
  // 如果脚本开启, 则注册脚本
  async loadPageScript(script: Script, registerScript_: chrome.userScripts.RegisteredUserScript): Promise<boolean> {
    // 如果脚本开启, 则注册脚本
    if (!this.isUserScriptsAvailable || !this.isLoadScripts || script.status !== SCRIPT_STATUS_ENABLE) {
      return false;
    }
    const { name, uuid } = script;
    const registerScript = registerScript_;
    const logger = LoggerCore.logger({
      name,
      registerMatch: {
        matches: registerScript.matches,
        excludeMatches: registerScript.excludeMatches,
      },
    });
    try {
      const res: chrome.userScripts.RegisteredUserScript | undefined = (
        await chrome.userScripts.getScripts({ ids: [uuid] })
      )?.[0];
      if (res) {
        await chrome.userScripts.update([registerScript]);
      } else {
        await chrome.userScripts.register([registerScript]);
      }
      return true;
    } catch (e) {
      logger.error("registerScript error", Logger.E(e));
      return false;
    }
  }

  async unregistryPageScripts(uuids: string[], forced: boolean = false) {
    if (forced ? false : !this.isUserScriptsAvailable || !this.isLoadScripts) {
      return;
    }
    try {
      const result = await chrome.userScripts?.getScripts({ ids: uuids });
      if (!result || typeof result !== "object" || typeof result.length !== "number") return; // 没 userScripts API 权限
      const filteredIds = result.map((entry) => entry.id).filter((id) => !!id);
      if (filteredIds.length > 0) {
        // 修改脚本状态为disable，浏览器取消注册该脚本
        await chrome.userScripts.unregister({ ids: filteredIds });
      }
    } catch (e) {
      this.logger.error(
        "unregister page scripts failed",
        { count: uuids.length, uuids: uuids.slice(0, 20) },
        Logger.E(e)
      );
    }
  }
}
