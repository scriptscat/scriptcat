import { uuidv4 } from "@App/pkg/utils/uuid";

// 注意：應只在 service_worker/offscreen 使用，而不要在 page/content 使用
// 檔案只存放在 chrome-extension://<your-extension-id>/ （sandbox）

const TEMP_FOLDER = "SC_TEMP_FILES";

const o = {
  OPFS_ROOT: null,
} as {
  OPFS_ROOT: FileSystemDirectoryHandle | null;
};
export const getOPFSRoot = async () => {
  o.OPFS_ROOT ||= await navigator.storage.getDirectory();
  return o.OPFS_ROOT;
};
export const initOPFS = async () => {
  o.OPFS_ROOT ||= await navigator.storage.getDirectory();
  const OPFS_ROOT = await getOPFSRoot();
  try {
    await OPFS_ROOT.removeEntry(TEMP_FOLDER, { recursive: true });
  } catch {
    // e.g. NotFoundError - ignore
  }
};
export const setOPFSTemp = async (data: string | BufferSource | Blob | WriteParams) => {
  o.OPFS_ROOT ||= await navigator.storage.getDirectory();
  const OPFS_ROOT = o.OPFS_ROOT;
  const filename = uuidv4();
  const directoryHandle = await OPFS_ROOT.getDirectoryHandle(TEMP_FOLDER, { create: true });
  const handle = await directoryHandle.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
  return filename;
};

export const getOPFSTemp = async (filename: string): Promise<File | null> => {
  o.OPFS_ROOT ||= await navigator.storage.getDirectory();
  const OPFS_ROOT = o.OPFS_ROOT;
  try {
    const directoryHandle = await OPFS_ROOT.getDirectoryHandle(TEMP_FOLDER);
    const handle = await directoryHandle.getFileHandle(filename);
    const file = await handle.getFile();
    return file;
  } catch {
    return null;
  }
};
