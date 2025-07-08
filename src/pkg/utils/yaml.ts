import { parse } from "yaml";
import {
  UserConfig,
} from "@App/app/repo/scripts";

export function parseUserConfig(code: string): UserConfig | undefined {
  const regex = /\/\*\s*==UserConfig==([\s\S]+?)\s*==\/UserConfig==\s*\*\//m;
  const config = regex.exec(code);
  if (!config) {
    return undefined;
  }
  const configs = config[1].trim().split(/[-]{3,}/);
  const ret: UserConfig = {};
  configs.forEach((val) => {
    const obj: UserConfig = parse(val);
    Object.keys(obj || {}).forEach((key) => {
      ret[key] = obj[key];
    });
  });
  return ret;
}