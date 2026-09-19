const nativeReflectApply = Reflect.apply;
const nativeStringStartsWith = String.prototype.startsWith;
const nativeStringSlice = String.prototype.slice;

export function getGrantCandidates(grant: string): string[] {
  if (nativeReflectApply(nativeStringStartsWith, grant, ["GM."])) {
    return [grant, `GM_${nativeReflectApply(nativeStringSlice, grant, [3])}`];
  }
  if (nativeReflectApply(nativeStringStartsWith, grant, ["GM_"])) {
    return [grant, `GM.${nativeReflectApply(nativeStringSlice, grant, [3])}`];
  }
  return [grant];
}
