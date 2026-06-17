export const quoteETag = (digest: string) => (digest.startsWith('"') && digest.endsWith('"') ? digest : `"${digest}"`);
