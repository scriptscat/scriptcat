import type { SCMetadata } from "@App/app/repo/metadata";
import { parseMetadataLines, type MetadataLine } from "@App/pkg/utils/script";
import {
  SCRIPTCAT_ONLY_METADATA_TAGS,
  ineffectiveMetadataValues,
  isSupportedGrant,
  isSupportedMetadataTag,
  resolveMetadataTagBase,
} from "@App/pkg/utils/script_compat";

export interface IneffectiveTag {
  /** 小写归一后的指令名，不含 @ */
  tag: string;
  /** 指令本身受支持、只是取值不生效时给出该取值 */
  value?: string;
  line: number | undefined;
}

export interface ScriptCatOnlyTag {
  tag: string;
  line: number | undefined;
}

export interface CompatMarks {
  /** 不生效的 @grant → 所在行号；键与权限卡 GM 能力行的 chip 取值一致，直接按名字打标 */
  grants: Map<string, number | undefined>;
  /** 不生效的元数据指令；权限卡里没有对应 chip，统一落在「其他声明」行 */
  tags: IneffectiveTag[];
  /** 脚本猫独有的指令；在脚本猫里生效，换到别的管理器不生效 */
  scriptcatOnlyTags: ScriptCatOnlyTag[];
}

/** 传给权限行的兼容性标记与跳转入口 */
export interface CompatView {
  marks: CompatMarks;
  /** 跳到代码预览的指定行；无预览可跳时不传 */
  onJump?: (line: number) => void;
}

/** 不生效项总数，用于卡头徽章 */
export const compatMarkCount = (marks: CompatMarks): number => marks.grants.size + marks.tags.length;

/**
 * 派生安装页的兼容性标记：脚本写了、但脚本猫不会执行的指令与 GM 能力。
 * 判定是二元的（见 script_compat.ts），这里只负责定位，不再分兼容程度。
 * 表外的指令不按名字猜它会影响哪一类权限：那需要一份不支持指令的清单，而别家新增的指令永远追不上。
 */
export function deriveCompatMarks(metadata: SCMetadata, code: string): CompatMarks {
  const lines = parseMetadataLines(code);
  // 同一指令的第 i 个取值 → 所在行；parseMetadata 按出现顺序聚合取值，下标一一对应。
  // metadata 与代码不同源时取值会对不上，此时宁可不给行号也不跳错行
  const tagLines = new Map<string, MetadataLine[]>();
  for (const entry of lines) {
    const list = tagLines.get(entry.tag);
    if (list) list.push(entry);
    else tagLines.set(entry.tag, [entry]);
  }
  const lineOf = (tag: string, index = 0, value?: string) => {
    const entry = tagLines.get(tag)?.[index];
    return entry && (value === undefined || entry.value === value) ? entry.line : undefined;
  };

  const grants = new Map<string, number | undefined>();
  (metadata.grant || []).forEach((grant, index) => {
    if (grant === "none" || isSupportedGrant(grant) || grants.has(grant)) return;
    grants.set(grant, lineOf("grant", index, grant));
  });

  const byLine = (a: { line: number | undefined }, b: { line: number | undefined }) =>
    (a.line ?? Infinity) - (b.line ?? Infinity);

  const ineffectiveValues = ineffectiveMetadataValues(metadata);
  // 独有指令在这份脚本里本身不生效时，读者要知道的是「不生效」，不再重复标「仅限脚本猫」
  const seen = new Set(ineffectiveValues.map((v) => v.tag).filter((tag) => SCRIPTCAT_ONLY_METADATA_TAGS.has(tag)));
  const tags: IneffectiveTag[] = [];
  const scriptcatOnlyTags: ScriptCatOnlyTag[] = [];
  // 以代码出现顺序为准；metadata 是对象，键序不表达脚本里的书写顺序
  const ordered = [...lines.map((l) => l.tag), ...Object.keys(metadata)];
  for (const rawTag of ordered) {
    const tag = resolveMetadataTagBase(rawTag);
    if (seen.has(tag)) continue;
    seen.add(tag);
    if (!isSupportedMetadataTag(tag)) tags.push({ tag, line: lineOf(tag) });
    else if (SCRIPTCAT_ONLY_METADATA_TAGS.has(tag)) scriptcatOnlyTags.push({ tag, line: lineOf(tag) });
  }
  for (const { tag, index, value } of ineffectiveValues) {
    tags.push({ tag, value, line: lineOf(tag, index, value) });
  }
  tags.sort(byLine);

  return { grants, tags, scriptcatOnlyTags };
}
