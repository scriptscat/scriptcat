import { ExtVersion } from "@App/app/const";
import type { GMInfoEnv } from "./types";
import type { TScriptInfo } from "@App/app/repo/scripts";

// 获取脚本信息和管理器信息
export function evaluateGMInfo(envInfo: GMInfoEnv, script: TScriptInfo) {
  const options = {
    description: script.metadata.description?.[0] || null,
    matches: script.metadata.match || [],
    includes: script.metadata.include || [],
    "run-at": script.metadata["run-at"]?.[0] || "document-idle",
    "run-in": script.metadata["run-in"] || [],
    icon: script.metadata.icon?.[0] || null,
    icon64: script.metadata.icon64?.[0] || null,
    header: script.metadataStr,
    grant: script.metadata.grant || [],
    connects: script.metadata.connect || [],
  };
  return {
    downloadMode: "native",
    isIncognito: envInfo.isIncognito,
    // relaxedCsp
    sandboxMode: envInfo.sandboxMode,
    scriptWillUpdate: !!script.checkUpdate,
    scriptHandler: "ScriptCat",
    userAgentData: envInfo.userAgentData,
    // "" => null
    scriptUpdateURL: script.downloadUrl || null,
    scriptMetaStr: script.metadataStr,
    userConfig: script.userConfig,
    userConfigStr: script.userConfigStr,
    version: ExtVersion,
    script: {
      // TODO: 更多完整的信息(为了兼容Tampermonkey,后续待定)
      name: script.name,
      namespace: script.namespace,
      version: script.metadata.version?.[0],
      author: script.author,
      lastModified: script.updatetime,
      downloadURL: script.downloadUrl || null,
      updateURL: script.checkUpdateUrl || null,
      ...options,
    },
  };
}
