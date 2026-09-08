export type SCMetadata = Partial<Record<string, string[]>>;

// OnlyRunOnUrl writes an empty include override; retain its provenance so resetMatch can distinguish it from a user override.
export const SELF_METADATA_ONLY_RUN_ON_URL = "__scriptcat_only_run_on_url";

// 解析标签 允许使用逗号和空格分隔
export function parseTags(metadata: SCMetadata): string[] {
  const tags = new Set<string>();
  const delimiterRegex = /[\s,，]+/;
  for (const tagString of metadata.tag || []) {
    for (const tag of tagString.split(delimiterRegex)) {
      tag && tags.add(tag);
    }
  }
  return [...tags];
}
