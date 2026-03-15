import semver from "semver";

/**
 * 将 prerelease 版本号转换为 Chrome 兼容的纯数字格式
 * 例如: "1.4.0-beta" -> "1.4.0.1100", "1.4.0-alpha.1" -> "1.4.0.1002"
 * 非 prerelease 版本原样返回
 */
export function toChromeVersion(ver) {
  const parsed = semver.parse(ver);
  if (!parsed || !parsed.prerelease.length) {
    return ver;
  }
  let betaVersion = 1000;
  switch (parsed.prerelease[0]) {
    case "alpha":
      betaVersion += parseInt(parsed.prerelease[1] || "0", 10) + 1 || 1;
      break;
    case "beta":
      betaVersion += 100 * (parseInt(parsed.prerelease[1] || "0", 10) + 1 || 1);
      break;
    default:
      throw new Error("未知的版本类型");
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch}.${betaVersion}`;
}
