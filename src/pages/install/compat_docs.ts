import { DocumentationSite } from "@App/app/const";
import { localePath } from "@App/locales/locales";

// 文档站（scriptcat.org 仓库 docs/dev/*.md）里有独立小节的条目 → Docusaurus 生成的锚点，中英文站一致。
// 不在表里的条目文档里没有说明（不支持的指令与 API 本来就不会写进文档），不给链接，免得点过去找不到。
// 锚点随标题文字生成，文档改标题后这里会退化成跳到页首，不会跳错地方。
const META_ANCHORS: Readonly<Record<string, string>> = {
  "run-at": "run-at",
  "run-in": "run-in",
  "early-start": "early-start-v110",
  "inject-into": "inject-into",
  storagename: "storagename-",
  background: "background",
  crontab: "crontab",
  match: "match",
  "require-css": "require-css",
};

const CAT_API_ANCHORS: Readonly<Record<string, string>> = {
  CAT_userConfig: "cat_userconfig",
  CAT_fileStorage: "cat_filestorage",
  CAT_scriptLoaded: "cat_scriptloaded",
};

/** 元数据指令在描述文档里的小节地址；localePath 随界面语言切换，须在调用时读取 */
export const metadataDocHref = (tag: string): string | undefined => {
  const anchor = META_ANCHORS[tag.toLowerCase()];
  return anchor ? `${DocumentationSite}${localePath}/docs/dev/meta#${anchor}` : undefined;
};

export const catApiDocHref = (grant: string): string | undefined => {
  const anchor = CAT_API_ANCHORS[grant];
  return anchor ? `${DocumentationSite}${localePath}/docs/dev/cat-api#${anchor}` : undefined;
};
