import Logger from "@App/app/logger/logger";
import semver from "semver";

// 对比版本大小
export function ltever(newVersion: string, oldVersion: string, logger?: Logger) {
  // 先验证符不符合语义化版本规范
  try {
    return semver.lte(newVersion, oldVersion);
  } catch (e) {
    logger?.warn("does not conform to the Semantic Versioning specification", Logger.E(e));
  }
  const newVer = newVersion.split(".");
  const oldVer = oldVersion.split(".");
  for (let i = 0; i < newVer.length; i++) {
    if (Number(newVer[i]) > Number(oldVer[i])) {
      return false;
    }
    if (Number(newVer[i]) < Number(oldVer[i])) {
      return true;
    }
  }
  return true;
}
