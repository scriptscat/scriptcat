import type { SCMetadata } from "@App/app/repo/metadata";
import type { PermissionKind, PermissionRow } from "./permissions";
import { parseMetadataLines, type MetadataLine } from "@App/pkg/utils/script";
import {
  SCRIPTCAT_ONLY_METADATA_TAGS,
  ineffectiveMetadataValues,
  isSupportedGrant,
  isSupportedMetadataTag,
  resolveMetadataTagBase,
} from "@App/pkg/utils/script_compat";

/** 不生效的指令挂到权限卡的哪一行呈现 */
export type IneffectiveTagGroup = "match" | "other";

export interface IneffectiveTag {
  /** 作者写的指令名，不含 @ */
  tag: string;
  /** 指令本身受支持、只是取值不生效时给出该取值 */
  value?: string;
  group: IneffectiveTagGroup;
  line: number | undefined;
}

export interface ScriptCatOnlyTag {
  tag: string;
  line: number | undefined;
}

export interface CompatMarks {
  /** 不生效的 @grant → 所在行号；键与权限卡 GM 能力行的 chip 取值一致，直接按名字打标 */
  grants: Map<string, number | undefined>;
  /** 解析不出规则的 @match 取值 → 所在行号；运行网站行按取值就地打标 */
  matches: Map<string, number | undefined>;
  /** 不生效的元数据指令；权限卡里没有对应 chip，按 group 追加呈现 */
  tags: IneffectiveTag[];
  /** 脚本猫独有的指令；在脚本猫里生效，换到别的管理器不生效 */
  scriptcatOnlyTags: ScriptCatOnlyTag[];
}

// 已知会影响「运行网站」的指令挂到那一行，读者才能就地判断后果。这里只决定摆放位置，
// 不决定支不支持（那由 script_compat.ts 的支持表判定）：不在表里的不生效指令一律落在「其他声明」，不会漏标。
// 只收 Tampermonkey / Violentmonkey 现行文档里的指令，别家特有的与旧写法不收。
const TAG_GROUP: Readonly<Record<string, IneffectiveTagGroup>> = {
  "exclude-match": "match",
};

/** 传给权限行的兼容性标记与跳转入口 */
export interface CompatView {
  marks: CompatMarks;
  /** 跳到代码预览的指定行；无预览可跳时不传 */
  onJump?: (line: number) => void;
}

/** 该权限行要额外呈现的不生效指令（只有 match 组落在既有权限行上，其余归「其他声明」） */
export const tagsForGroup = (marks: CompatMarks, group: IneffectiveTagGroup): IneffectiveTag[] =>
  marks.tags.filter((tag) => tag.group === group);

/** 该取值在这一类权限行里是否带不生效标记 */
export const isMarkedValue = (marks: CompatMarks, kind: PermissionKind, value: string): boolean =>
  (kind === "grant" && marks.grants.has(value)) || (kind === "match" && marks.matches.has(value));

/** 该权限行是否带不生效标记（含追加到这一行的指令）；带标记的行不能被折叠藏起来 */
export const rowHasCompatMarks = (marks: CompatMarks, row: PermissionRow): boolean =>
  row.values.some((value) => isMarkedValue(marks, row.kind, value)) ||
  (row.kind === "match" && tagsForGroup(marks, "match").length > 0);

/** 不生效项总数，用于卡头徽章 */
export const compatMarkCount = (marks: CompatMarks): number =>
  marks.grants.size + marks.matches.size + marks.tags.length;

/**
 * 派生安装页的兼容性标记：脚本写了、但脚本猫不会执行的指令与 GM 能力。
 * 判定是二元的（见 script_compat.ts），这里只负责定位与归组，不再分兼容程度。
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

  const nameOf = (tag: string) => tagLines.get(tag)?.[0].name ?? tag;

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
    if (!isSupportedMetadataTag(tag)) {
      tags.push({ tag: nameOf(tag), group: TAG_GROUP[tag] ?? "other", line: lineOf(tag) });
    } else if (SCRIPTCAT_ONLY_METADATA_TAGS.has(tag)) {
      scriptcatOnlyTags.push({ tag: nameOf(tag), line: lineOf(tag) });
    }
  }
  const matches = new Map<string, number | undefined>();
  for (const { tag, index, value } of ineffectiveValues) {
    const line = lineOf(tag, index, value);
    // @match 的取值本身就是运行网站行里的一枚 chip，就地打标，不再另成一条
    if (tag === "match") {
      if (!matches.has(value)) matches.set(value, line);
    } else {
      tags.push({ tag: nameOf(tag), value, group: "other", line });
    }
  }
  tags.sort(byLine);

  return { grants, matches, tags, scriptcatOnlyTags };
}
