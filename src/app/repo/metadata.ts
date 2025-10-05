export type SCMetadata = Record<string, string[]>;

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
