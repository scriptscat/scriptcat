import type { SCMetadata } from "@App/app/repo/metadata";
import { parseMetadataLines } from "@App/pkg/utils/script";
import { isSupportedGrant, isSupportedMetadataTag, resolveMetadataTagBase } from "@App/pkg/utils/script_compat";

export interface IneffectiveTag {
  /** 小写归一后的指令名，不含 @ */
  tag: string;
  line: number | undefined;
}

export interface CompatMarks {
  /** 不生效的 @grant → 所在行号；键与权限卡 GM 能力行的 chip 取值一致，直接按名字打标 */
  grants: Map<string, number | undefined>;
  /** 不生效的元数据指令；权限卡里没有对应 chip，统一落在「其他声明」行 */
  tags: IneffectiveTag[];
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
  const firstLineOf = new Map<string, number>();
  for (const { tag, value, line } of lines) {
    const tagKey = `@${tag}`;
    if (!firstLineOf.has(tagKey)) firstLineOf.set(tagKey, line);
    // @grant 按取值定位，同一指令的不同能力各自成行
    if (tag === "grant") {
      const grantKey = `grant:${value}`;
      if (!firstLineOf.has(grantKey)) firstLineOf.set(grantKey, line);
    }
  }

  const grants = new Map<string, number | undefined>();
  for (const grant of metadata.grant || []) {
    if (grant === "none" || isSupportedGrant(grant) || grants.has(grant)) continue;
    grants.set(grant, firstLineOf.get(`grant:${grant}`));
  }

  const seen = new Set<string>();
  const tags: IneffectiveTag[] = [];
  // 以代码出现顺序为准；metadata 是对象，键序不表达脚本里的书写顺序
  const ordered = [...lines.map((l) => l.tag), ...Object.keys(metadata)];
  for (const rawTag of ordered) {
    const tag = resolveMetadataTagBase(rawTag);
    if (seen.has(tag) || isSupportedMetadataTag(tag)) continue;
    seen.add(tag);
    tags.push({ tag, line: firstLineOf.get(`@${tag}`) });
  }

  return { grants, tags };
}
