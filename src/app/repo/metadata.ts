export type SCMetadata = Record<string, string[]>;

// 解析标签 允许使用逗号和空格分隔
export function parseTags(metadata: SCMetadata): string[] {
  const tags: string[] = [];
  for (const item of metadata["tag"] || []) {
    tags.push(...item.split(/[\s,，]+/).filter(Boolean));
  }
  return Array.from(new Set(tags));
}
