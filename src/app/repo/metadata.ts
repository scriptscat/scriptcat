export type SCMetadata = Record<string, string[]>;

// 解析标签 允许使用逗号和空格分隔
export function parseTags(metadata: SCMetadata): string[] {
  const tags: string[] = [];
  for (const key in metadata.tag) {
    if (metadata.tag[key]) {
      tags.push(...metadata.tag[key]!.split(/[\s,，]+/).filter(Boolean));
    }
  }
  return Array.from(new Set(tags));
}
