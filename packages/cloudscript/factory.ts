import type { ExportTarget } from "@App/app/repo/export";
import type { ExportParams } from "./cloudscript";
import LocalCloudScript from "./local";

export interface CloudScriptParams {
  [key: string]: {
    title: string;
    type?: "select";
    options?: string[];
  };
}

export default class CloudScriptFactory {
  static create(type: ExportTarget, params: ExportParams) {
    switch (type) {
      case "local":
        return new LocalCloudScript(params);
      default:
        throw new Error(`unknown type ${type}`);
    }
  }

  static params(): { [key: string]: CloudScriptParams } {
    return {
      local: {},
    };
  }
}
