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
function createScriptInfo(
  uuid: string,
  code: string,
  url: string,
  source: InstallSource,
  metadata: SCMetadata
): ScriptInfo {
  const userSubscribe = metadata.usersubscribe !== undefined;
  return { uuid, code, url, source, metadata, userSubscribe } as ScriptInfo;
}

const saveTempCode = async (tempUUID: string, code: string) => {
  const folder = await navigator.storage
    .getDirectory()
    .then((root) => root.getDirectoryHandle("temp_install_codes", { create: true }));
  const handle = await folder.getFileHandle(`${tempUUID}.user.js`, { create: true });
  const writable = await handle.createWritable();
  await writable.write(code);
  await writable.close();
};

export const getTempCode = async (tempUUID: string): Promise<string | undefined> => {
  try {
    const folder = await navigator.storage.getDirectory().then((root) => root.getDirectoryHandle("temp_install_codes"));
    const handle = await folder.getFileHandle(`${tempUUID}.user.js`);
    return await handle.getFile().then((f) => f.text());
  } catch (err: any) {
    if (err?.name === "NotFoundError") {
      return undefined;
    }
    console.error("[scriptInstall] getTempCode failed:", err);
    throw err;
  }
};

export const removeCachedCodes = async (uuids: string[]) => {
  if (!uuids.length) return;
  let folder: FileSystemDirectoryHandle;
  try {
    folder = await navigator.storage.getDirectory().then((root) => root.getDirectoryHandle("temp_install_codes"));
  } catch {
    return;
  }
  await Promise.all(
    uuids.map(async (uuid) => {
      try {
        await folder.removeEntry(`${uuid}.user.js`);
      } catch {
        // ignore
      }
    })
  );
};

export const createTempCodeEntry = async (
  update: boolean,
  uuid: string,
  code: string,
  url: string,
  source: InstallSource,
  metadata: SCMetadata,
  options: any
) => {
  await saveTempCode(uuid, code);
  const si = [update, createScriptInfo(uuid, "", url, source, metadata), options];
  return si;
};

export const createScriptInfoLocal = async (
  uuid: string,
  code: string,
  url: string,
  source: InstallSource,
  metadata: SCMetadata
) => {
  await saveTempCode(uuid, code);
  const info = createScriptInfo(uuid, "", url, source, metadata);
  info.code = code;
  return info;
};
