export type ResourceDeclaration = {
  name: string;
  url: string;
};

export function parseResourceDeclaration(value: string): ResourceDeclaration | undefined {
  const split = value.split(/\s+/);
  if (split.length !== 2 || !split[0] || !split[1].trim()) return undefined;
  return { name: split[0], url: split[1].trim() };
}
