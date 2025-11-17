import { parse } from "yaml";
import type { UserConfig } from "@App/app/repo/scripts";

export function parseUserConfig(code: string): UserConfig | undefined {
  const regex = /\/\*\s*==UserConfig==([\s\S]+?)\s*==\/UserConfig==\s*\*\//m;
  const config = regex.exec(code);
  if (!config) {
    return undefined;
  }

  const configs = config[1].trim().split(/[-]{3,}/);
  const ret: UserConfig = {};

  const sortSet = new Set<string>();

  for (const val of configs) {
    const obj: UserConfig = parse(val);
    if (!obj || typeof obj !== "object") {
      continue;
    }
    // 验证是否符合分组规范：group -> config -> properties
    for (const [groupKey, groupValue] of Object.entries(obj)) {
      if (!groupValue || typeof groupValue !== "object") {
        // 如果分组值不是对象，说明不符合规范
        throw new Error(`UserConfig group "${groupKey}" is not a valid object.`);
      }

      //@ts-ignore
      ret[groupKey] = groupValue;

      if (groupKey === "#options") {
        continue;
      }

      sortSet.add(groupKey);

      Object.keys(ret[groupKey] || {}).forEach((subKey, subIndex) => {
        const groupData = ret[groupKey] as { [key: string]: any };
        if (groupData[subKey] && typeof groupData[subKey] === "object") {
          groupData[subKey].index = groupData[subKey].index || subIndex; // 确保index存在
        }
      });
    }
  }
  ret["#options"] = { sort: Array.from(sortSet) };
  return ret;
}
