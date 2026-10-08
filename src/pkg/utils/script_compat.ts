import type { SCMetadata } from "@App/app/repo/metadata";
import { getGrantCandidates } from "@App/app/service/content/gm_api/grant";
import { extractUrlPatterns } from "./url_matcher";

/**
 * 脚本猫的兼容性支持表：安装页与编辑器共用的唯一判定来源。
 *
 * 判定是二元的——指令/能力要么被脚本猫消费，要么写了也不会生效，没有中间档。
 * 表外即「不生效」，因此收录标准是「脚本猫会消费它」或「脚本猫不消费但它也不改变脚本运行行为」；
 * 只有会改变别家管理器下脚本行为、而脚本猫没实现的指令才刻意留在表外（如 @exclude-match）。
 * 取值同理：取值有限的指令只认白名单里的取值，运行时对不认得的取值会静默回退。
 */

// name/description/antifeature 可带 `:<locale>` 后缀取本地化值（src/locales/locales.ts），
// 是同一条指令的语言变体而非独立指令。其余指令的冒号（uso:script 等）是名字的一部分。
const LOCALE_SUFFIXED_TAG = /^(name|description|antifeature):(.+)$/;

/** 归一到判定用的指令名：小写，并去掉本地化后缀 */
export const resolveMetadataTagBase = (tag: string): string => {
  const normalized = tag.toLowerCase();
  const localeMatch = LOCALE_SUFFIXED_TAG.exec(normalized);
  return localeMatch ? localeMatch[1] : normalized;
};

// 脚本猫会读取的指令：注入与匹配链路、脚本类型判定、云端/订阅、以及列表与安装页的展示字段。
const CONSUMED_TAGS = [
  "name",
  "namespace",
  "version",
  "description",
  "author",
  "match",
  "include",
  "exclude",
  "connect",
  "grant",
  "require",
  "require-css",
  "resource",
  "run-at",
  "run-in",
  "noframes",
  "inject-into",
  "unwrap",
  "early-start",
  "background",
  "crontab",
  "antifeature",
  "tag",
  "storagename",
  "cloudcat",
  "cloudserver",
  "exportvalue",
  "exportcookie",
  "scripturl",
  "usersubscribe",
  "updateurl",
  "downloadurl",
  "icon",
  "iconurl",
  "icon64",
  "icon64url",
  "defaulticon",
];

// 脚本猫不消费，但也不改变脚本运行行为的指令：著作信息、脚本站元数据、构建提示。
// 它们出现在脚本里是正常的，标成「不生效」只会制造噪音。
// definition 是脚本猫自己文档化的编辑器指令，当前没有任何消费方；在它被实现或从文档撤下之前
// 按信息类处理，避免安装页对着脚本猫自己的文档报警。
const INFORMATIONAL_TAGS = [
  "license",
  "copyright",
  "homepage",
  "homepageurl",
  "website",
  "source",
  "supporturl",
  "installurl",
  "compatible",
  "definition",
  "contributor",
  "contributors",
  "collaborator",
  "creator",
  "developer",
  "contributionurl",
  "contributionamount",
  "screenshot",
  "history",
  "id",
  "major",
  "minor",
  "build",
  "unstableminify",
  "oujs:author",
  "oujs:collaborator",
  "uso:script",
  "uso:version",
  "uso:timestamp",
  "uso:hash",
  "uso:rating",
  "uso:installs",
  "uso:reviews",
  "uso:discussions",
  "uso:fans",
  "uso:unlisted",
];

// 不是作者写出来的指令，而是 parseMetadata 为 .user.sub.js 合成的标记；
// 订阅脚本的 metadata 里会出现这个键，必须视为支持，否则安装页会把它标成不生效。
export const SYNTHETIC_METADATA_TAGS: ReadonlySet<string> = new Set(["usersubscribe"]);

export const CONSUMED_METADATA_TAGS: ReadonlySet<string> = new Set(CONSUMED_TAGS);

export const SUPPORTED_METADATA_TAGS: ReadonlySet<string> = new Set([...CONSUMED_TAGS, ...INFORMATIONAL_TAGS]);

export const isSupportedMetadataTag = (tag: string): boolean =>
  SUPPORTED_METADATA_TAGS.has(resolveMetadataTagBase(tag));

// 脚本猫独有、别家管理器不认的指令。script_compat.test.ts 对照 eslint-plugin-userscripts 收录的别家指令守卫
export const SCRIPTCAT_ONLY_METADATA_TAGS: ReadonlySet<string> = new Set([
  "require-css",
  "early-start",
  "background",
  "crontab",
  "storagename",
  "cloudcat",
  "cloudserver",
  "exportvalue",
  "exportcookie",
  "scripturl",
]);

// 运行时按 metadata[tag][0] 与这些取值逐字比较，其余取值（含大小写不同）都会回退到默认行为：
// run-at → getRunAt / isContextMenuScript / script_executor；run-in → runtime.ts；
// inject-into → isInjectIntoContent，page 即默认行为；unwrap / early-start → metadataBlankOrTrue。
// false 与不写的效果一致，写出来也符合作者本意，不算不生效。
const BLANK_OR_BOOLEAN = new Set(["", "true", "false"]);
const SUPPORTED_TAG_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
  "run-at": new Set(["document-start", "document-body", "document-end", "document-idle", "context-menu"]),
  "run-in": new Set(["all", "normal-tabs", "incognito-tabs"]),
  "inject-into": new Set(["page", "content"]),
  unwrap: BLANK_OR_BOOLEAN,
  "early-start": BLANK_OR_BOOLEAN,
};

export const VALUE_CONSTRAINED_TAGS: readonly string[] = Object.keys(SUPPORTED_TAG_VALUES);

export interface IneffectiveMetadataValue {
  tag: string;
  /** 在 metadata[tag] 中的下标，用于回找代码行 */
  index: number;
  value: string;
}

/** 受支持指令里不会按写法生效的取值：不在白名单内、运行时只读第一个而被忽略的后续取值、解析不出规则的 @match */
export function ineffectiveMetadataValues(metadata: SCMetadata): IneffectiveMetadataValue[] {
  const result: IneffectiveMetadataValue[] = [];
  for (const [tag, allowed] of Object.entries(SUPPORTED_TAG_VALUES)) {
    (metadata[tag] || []).forEach((value, index) => {
      const effective =
        index === 0 &&
        allowed.has(value) &&
        // early-start 只在 document-start 下接管注入（isEarlyStartScript）
        (tag !== "early-start" || metadata["run-at"]?.[0] === "document-start");
      if (!effective) result.push({ tag, index, value });
    });
  }
  // @match 写法开放，交给运行时同一个解析器判：解析不出规则的会被静默丢弃（@include/@exclude 总能退化成 glob）
  (metadata.match || []).forEach((value, index) => {
    if (!extractUrlPatterns([`@match ${value}`]).length) result.push({ tag: "match", index, value });
  });
  return result;
}

// 不经 GMContext 注册表、由沙盒上下文直接提供或无需授权的能力：
// unsafeWindow 与 GM_info 恒定注入（src/app/service/content/create_context.ts、exec_script.ts），
// window.onurlchange 在 createContext 里单独接管，none 表示不请求任何 GM 能力。
export const CONTEXT_PROVIDED_GRANTS: ReadonlySet<string> = new Set([
  "none",
  "unsafeWindow",
  "GM_info",
  "GM.info",
  "window.onurlchange",
]);

// GMContext 注册表在 src/app/service/content/gm_api/ 由装饰器填充，安装页不能为了查一次支持性
// 把整套 GM 实现拉进包里，因此在此静态镜像一份；script_compat.test.ts 守卫两者一致。
const REGISTERED_GRANTS = [
  "CAT.agent.conversation",
  "CAT.agent.dom",
  "CAT.agent.model",
  "CAT.agent.opfs",
  "CAT.agent.skills",
  "CAT.agent.task",
  "CAT_createBlobUrl",
  "CAT_fetchBlob",
  "CAT_fetchDocument",
  "CAT_fileStorage",
  "CAT_registerMenuInput",
  "CAT_scriptLoaded",
  "CAT_unregisterMenuInput",
  "CAT_userConfig",
  "GM.addElement",
  "GM.addStyle",
  "GM.audio",
  "GM.addValueChangeListener",
  "GM.closeInTab",
  "GM.closeNotification",
  "GM.cookie",
  "GM.deleteValue",
  "GM.deleteValues",
  "GM.download",
  "GM.getResourceText",
  "GM.getResourceURL",
  "GM.getResourceUrl",
  "GM.getTab",
  "GM.getTabs",
  "GM.getValue",
  "GM.getValues",
  "GM.listValues",
  "GM.log",
  "GM.notification",
  "GM.openInTab",
  "GM.registerMenuCommand",
  "GM.removeValueChangeListener",
  "GM.saveTab",
  "GM.setClipboard",
  "GM.setValue",
  "GM.setValues",
  "GM.unregisterMenuCommand",
  "GM.updateNotification",
  "GM.xmlHttpRequest",
  "GM_addElement",
  "GM_addStyle",
  "GM_addValueChangeListener",
  "GM_audio",
  "GM_closeInTab",
  "GM_closeNotification",
  "GM_cookie",
  "GM_deleteValue",
  "GM_deleteValues",
  "GM_download",
  "GM_getResourceText",
  "GM_getResourceURL",
  "GM_getTab",
  "GM_getTabs",
  "GM_getValue",
  "GM_getValues",
  "GM_listValues",
  "GM_log",
  "GM_notification",
  "GM_openInTab",
  "GM_registerMenuCommand",
  "GM_removeValueChangeListener",
  "GM_saveTab",
  "GM_setClipboard",
  "GM_setValue",
  "GM_setValues",
  "GM_unregisterMenuCommand",
  "GM_updateNotification",
  "GM_xmlhttpRequest",
  "window.close",
  "window.focus",
];

export const SUPPORTED_GRANTS: ReadonlySet<string> = new Set([...REGISTERED_GRANTS, ...CONTEXT_PROVIDED_GRANTS]);

// 与运行时同一套候选规则：@grant GM.foo 与 GM_foo 互认（src/app/service/content/gm_api/grant.ts）
export const isSupportedGrant = (grant: string): boolean =>
  getGrantCandidates(grant).some((candidate) => SUPPORTED_GRANTS.has(candidate));

// CAT_ / CAT. 是脚本猫自有的 API 命名空间，其他脚本管理器没有这些能力
export const isScriptCatOnlyGrant = (grant: string): boolean => /^CAT[_.]/.test(grant) && isSupportedGrant(grant);
