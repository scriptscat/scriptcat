import type { InstallSource } from "@App/app/service/service_worker/types";
import type { SCMetadata } from "@App/app/repo/metadata";

export { InstallSource };

export type ScriptInfo = {
  url: string;
  code: string;
  uuid: string;
  userSubscribe: boolean;
  metadata: SCMetadata;
  source: InstallSource;
};

// 供 getInstallInfo 使用
export function createScriptInfo(
  uuid: string,
  code: string,
  url: string,
  source: InstallSource,
  metadata: SCMetadata
): ScriptInfo {
  const userSubscribe = metadata.usersubscribe !== undefined;
  return { uuid, code, url, source, metadata, userSubscribe } as ScriptInfo;
}
