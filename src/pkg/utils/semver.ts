export const enum VersionCompare {
  LESS = -1,
  EQUAL = 0,
  GREATER = 1,
}

// 对比版本大小 (ltever相容旧版用)
export const ltever = (newVersion: string, oldVersion: string): boolean => {
  return versionCompare(newVersion, oldVersion) <= 0;
};

// 参考 https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/version/format
// 考虑 UserScript 的脚本号设计进行简化及修改
export const versionCompare = (version1: string, version2: string): VersionCompare => {
  // -1 if version1 < version2
  // 0 if version1 == version2
  // 1 if version1 > version2
  const v1 = version1.split(".").map((e) => e.split(/(\D+)/g));
  const v2 = version2.split(".").map((e) => e.split(/(\D+)/g));
  let i = -1;
  while (true) {
    i++;
    let e1 = v1[i];
    let e2 = v2[i];
    if (e1 === undefined && e2 === undefined) break;
    if (e1 === undefined) e1 = [];
    if (e2 === undefined) e2 = [];
    let j = -1;
    while (true) {
      j++;
      let w1: number | string = e1[j];
      let w2: number | string = e2[j];
      if (w1 === undefined && w2 === undefined) break;
      if (+(w1 || "0") === 0 && +(w2 || "0") === 0) continue; // 空值与零值等价
      const isCharCmp = (j & 1) === 1;
      if (!isCharCmp) {
        // 数值对比
        w1 = +w1 || 0;
        w2 = +w2 || 0;
        if (w1 === w2) continue;
        return w1 < w2 ? -1 : 1;
      }
      if (!w1 && w2) return 1;
      if (!w2 && w1) return -1;
      // 忽略非英文字符的变更进行对比
      const w1c = w1.replace(/[^a-zA-Z]/g, ".").toLowerCase(); // 不区分大小写
      const w2c = w2.replace(/[^a-zA-Z]/g, ".").toLowerCase(); // 不区分大小写
      const c = w1c.localeCompare(w2c);
      if (c) return c;
    }
  }
  return 0;
};
