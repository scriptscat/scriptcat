export function getGrantCandidates(grant: string): string[] {
  if (grant.startsWith("GM.")) {
    return [grant, `GM_${grant.slice(3)}`];
  }
  if (grant.startsWith("GM_")) {
    return [grant, `GM.${grant.slice(3)}`];
  }
  return [grant];
}
