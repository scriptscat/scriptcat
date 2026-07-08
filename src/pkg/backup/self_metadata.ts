import type { SCMetadata } from "@App/app/repo/metadata";

/** 归一化后的自定义覆盖：TM override / VM custom 都收敛到这个形状 */
export type OverrideInput = {
  use_matches?: string[];
  use_includes?: string[];
  use_excludes?: string[];
  use_connects?: string[];
  merge_matches?: boolean;
  merge_includes?: boolean;
  merge_excludes?: boolean;
  merge_connects?: boolean;
  run_at?: string | null;
  noframes?: boolean | null;
};

const LIST_MAP = [
  ["match", "use_matches", "merge_matches"],
  ["include", "use_includes", "merge_includes"],
  ["exclude", "use_excludes", "merge_excludes"],
  ["connect", "use_connects", "merge_connects"],
] as const;

const RUN_AT_RE = /^document-(start|body|end|idle)$/;

/**
 * 归一化 override → selfMetadata。
 * merge===false 表示替换脚本自带；merge!==false 且 use 非空表示合并（脚本自带 ∪ 用户新增）。
 */
export function overrideToSelfMetadata(input: OverrideInput, scriptMetadata: SCMetadata): SCMetadata {
  const self: SCMetadata = {};
  for (const [scKey, useKey, mergeKey] of LIST_MAP) {
    const use = input[useKey];
    if (use === undefined) continue;
    if (input[mergeKey] === false) {
      self[scKey] = [...use];
    } else if (use.length > 0) {
      self[scKey] = [...new Set([...(scriptMetadata[scKey] || []), ...use])];
    }
  }
  if (input.run_at && RUN_AT_RE.test(input.run_at)) {
    self["run-at"] = [input.run_at];
  }
  if (input.noframes === true) {
    self.noframes = [""];
  }
  return self;
}

type VMCustom = {
  match?: string[];
  include?: string[];
  exclude?: string[];
  excludeMatch?: string[];
  origMatch?: boolean;
  origInclude?: boolean;
  origExclude?: boolean;
  origExcludeMatch?: boolean;
  runAt?: string;
  noframes?: number | null;
};

/** Violentmonkey custom → 归一化 override */
export function vmCustomToOverride(custom: VMCustom | undefined): OverrideInput {
  const c = custom || {};
  const hasExclude = c.exclude !== undefined || c.excludeMatch !== undefined;
  return {
    use_matches: c.match,
    use_includes: c.include,
    use_excludes: hasExclude ? [...(c.exclude || []), ...(c.excludeMatch || [])] : undefined,
    use_connects: undefined,
    merge_matches: c.origMatch !== false,
    merge_includes: c.origInclude !== false,
    merge_excludes: c.origExclude !== false && c.origExcludeMatch !== false,
    run_at: c.runAt,
    noframes: c.noframes == null ? null : !!c.noframes,
  };
}

/** VM 导出用于给 values 建键的文件名编码（common/string.js encodeFilename） */
export function encodeVmFilename(name: string): string {
  return name.replace(/[-/:*?"<>|%\s]/g, (ch) => "-" + ch.charCodeAt(0).toString(16).padStart(2, "0"));
}

/** VM values 的键：encodeFilename(`${namespace}\n${name}\n`) */
export function vmValueUri(namespace: string, name: string): string {
  return encodeVmFilename(`${namespace}\n${name}\n`);
}
