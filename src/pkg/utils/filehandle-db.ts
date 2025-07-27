import Dexie from "dexie";
const dbName = "filehandle-temp-dexie";

// Define the Dexie database class
class FileHandleDB extends Dexie {
  handles: Dexie.Table<{ handle: FileSystemFileHandle; timestamp: number }, string>;

  constructor() {
    super(dbName);
    this.version(1).stores({
      handles: "", // No key path, keys are provided explicitly as strings
    });
    this.handles = this.table("handles");
  }
}

// Instantiate the database
const db = new FileHandleDB();

// Save a file handle with a timestamp
export async function saveHandle(key: string, handle: FileSystemFileHandle): Promise<void> {
  await db.handles.put({ handle, timestamp: Date.now() }, key);
}

// Load a file handle by key
export async function loadHandle(key: string): Promise<FileSystemFileHandle> {
  const result = await db.handles.get(key);
  if (result?.handle instanceof FileSystemFileHandle) {
    return result.handle;
  } else {
    throw new Error("Handle not found or invalid");
  }
}

// Delete a file handle by key
export async function deleteHandle(key: string): Promise<void> {
  await db.handles.delete(key);
}

// 清除超过 15 分钟未使用的FileHandle
export async function cleanupOldHandles(maxAgeMs = 15 * 60 * 1000): Promise<void> {
  const now = Date.now();
  await db.handles.filter((entry) => now - entry.timestamp > maxAgeMs).delete();
}
