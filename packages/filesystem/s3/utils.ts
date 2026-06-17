export function quoteETag(digest: string): string {
  return digest.startsWith('"') && digest.endsWith('"') ? digest : `"${digest}"`;
}
