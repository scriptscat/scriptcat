const handleRecords = new Set<[FileSystemFileHandle, FTInfo, FileSystemObserverInstance]>();

export type FTInfo = {
  uuid: string;
  fileName: string;
  setCode(code: string, hideInfo?: boolean): void;
  lastModified?: number;
};

const callback = async (records: FileSystemChangeRecord[], observer: FileSystemObserverInstance) => {
  for (const record of records) {
    const { root, type } = record;
    if (!(root instanceof FileSystemFileHandle) || type !== "modified") continue;
    for (const [fileHandle, ftInfo, fileObserver] of handleRecords) {
      if (fileObserver !== observer) continue;
      try {
        const isSame = await root.isSameEntry(fileHandle);
        if (!isSame) continue;
        // 调用安装
        const file = await root.getFile();
        // 避免重复更新
        if (ftInfo.lastModified === file.lastModified) continue;
        ftInfo.lastModified = file.lastModified;
        const code = await file.text();
        if (code && typeof code === "string") {
          ftInfo.setCode(code, false);
        }
      } catch (e) {
        console.warn(e);
      }
    }
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
