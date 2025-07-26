const dbName = "filehandle-temp-db";
const storeName = "handles";

// 打开或创建 IndexedDB 数据库
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // 如果对象存储不存在则创建
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 保存FileHandle和timestamp
export async function saveHandle(key: string, handle: FileSystemFileHandle) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put({ handle, timestamp: Date.now() }, key);
  return new Promise((resolve, reject) => {
    tx.addEventListener("complete", resolve);
    tx.addEventListener("abort", reject);
    tx.addEventListener("error", reject);
  });
}

// 加载FileHandle
export async function loadHandle(key: string): Promise<FileSystemFileHandle> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => {
      const result = req.result;
      if (result?.handle instanceof FileSystemFileHandle) {
        resolve(result.handle);
      } else {
        reject("incorrect IDBRequest.result");
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// 根据键删除FileHandle
export async function deleteHandle(key: string): Promise<any> {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  return new Promise((resolve, reject) => {
    tx.addEventListener("complete", resolve);
    tx.addEventListener("abort", reject);
    tx.addEventListener("error", reject);
  });
}

// 清除超过 15 分钟未使用的FileHandle
export async function cleanupOldHandles(maxAgeMs = 15 * 60 * 1000): Promise<any> {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  const now = Date.now();

  const req = store.openCursor();
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) {
      const { timestamp } = cursor.value || {};
      if (typeof timestamp === "number" && now - timestamp > maxAgeMs) {
        cursor.delete();
      }
      cursor.continue();
    }
  };

  return new Promise((resolve, reject) => {
    tx.addEventListener("complete", resolve);
    tx.addEventListener("abort", reject);
    tx.addEventListener("error", reject);
  });
}
