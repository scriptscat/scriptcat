import { getGrantCandidates } from "@App/app/service/content/gm_api/grant";

/**
 * 脚本猫的兼容性支持表：安装页与编辑器共用的唯一判定来源。
 *
 * 判定是二元的——指令/能力要么被脚本猫消费，要么写了也不会生效，没有中间档。
 * 表外即「不生效」，因此收录标准是「脚本猫会消费它」或「脚本猫不消费但它也不改变脚本运行行为」；
 * 只有会改变别家管理器下脚本行为、而脚本猫没实现的指令才刻意留在表外（如 @exclude-match）。
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

export const SUPPORTED_METADATA_TAGS: ReadonlySet<string> = new Set([...CONSUMED_TAGS, ...INFORMATIONAL_TAGS]);

export const isSupportedMetadataTag = (tag: string): boolean =>
  SUPPORTED_METADATA_TAGS.has(resolveMetadataTagBase(tag));

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
