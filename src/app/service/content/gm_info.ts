
import { ExtVersion } from "@App/app/const";
import { parseUserConfig } from "@App/pkg/utils/yaml";
import type { GMInfoEnv } from "./types";
import type { ScriptLoadInfo } from "../service_worker/types";

// 获取脚本信息和管理器信息
export function evaluateGMInfo(envInfo: GMInfoEnv, script: ScriptLoadInfo) {
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
      scriptWillUpdate: true,
      scriptHandler: "ScriptCat",
      userAgentData: envInfo.userAgentData,
      // "" => null
      scriptUpdateURL: script.downloadUrl || null,
      scriptMetaStr: script.metadataStr,
      userConfig: parseUserConfig(script.userConfigStr),
      userConfigStr: script.userConfigStr,
      // scriptSource: script.sourceCode,
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