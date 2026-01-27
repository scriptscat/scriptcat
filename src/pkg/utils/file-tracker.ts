const handleRecords = new Set<[FileSystemFileHandle, FTInfo, FileSystemObserverInstance]>();

export type FTInfo = {
  uuid: string;
  fileName: string;
  setCode(code: string, hideInfo?: boolean): void;
  lastModified?: number;
};

const getHandleRecord = async (root: FileSystemFileHandle, observer: FileSystemObserverInstance) => {
  for (const [fileHandle, ftInfo, fileObserver] of handleRecords) {
    if (fileObserver !== observer) continue;
    try {
      const isSame = await root.isSameEntry(fileHandle);
      if (!isSame) continue;
      const file = await root.getFile();
      if (file && file.lastModified > 0) {
        return { ftInfo, file };
      }
    } catch (e) {
      // 档案改名或删掉时，或会被此捕捉（预期报错）
      console.warn(e);
    }
  }
  return { ftInfo: null, file: null };
};

const callback = async (records: FileSystemChangeRecord[], observer: FileSystemObserverInstance) => {
  try {
    for (const record of records) {
      const { root, type } = record;
      if (!(root instanceof FileSystemFileHandle)) continue;
      // 只要 FileSystemObserver 侦测到档案改变，就试一下找记录和读档
      const { ftInfo, file } = await getHandleRecord(root, observer);
      // 如没有记录或读档失败则忽略
      if (!ftInfo || !file) continue;
      // 读档成功且有效 （ 文字档考虑 ==UserScript== 等东西，至少应有 30 bytes )
      if (file.size > 30) {
        // 如成功读档但显示为失败，则重新 observe
        if (type === "errored") {
          observer.observe(root);
        }
        // 以 lastModified 判断避免重复更新
        if (ftInfo.lastModified === file.lastModified) continue;
        ftInfo.lastModified = file.lastModified;
        const code = await file.text();
        if (code && typeof code === "string") {
          ftInfo.setCode(code, false);
        }
      }
    }
  } catch (e) {
    // 捕捉其他非遇期错误
    console.warn(e);
  }
};

export const startFileTrack = (fileHandle: FileSystemFileHandle, ftInfo: FTInfo) => {
  const fileObserver = new FileSystemObserver(callback);
  handleRecords.add([fileHandle, ftInfo, fileObserver]);
  fileObserver.observe(fileHandle);
};

export const unmountFileTrack = async (fileHandle: FileSystemFileHandle) => {
  try {
    for (const entry of handleRecords) {
      const [fileHandleEntry, _ftInfo, fileObserver] = entry;
      if (await fileHandle.isSameEntry(fileHandleEntry)) {
        handleRecords.delete(entry);
        fileObserver.disconnect();
        return true;
      }
    }
  } catch (e) {
    console.warn(e);
  }
  return false;
};
