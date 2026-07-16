import type { Script } from "./scripts";
import type { InstallSource } from "../service/service_worker/types";

const TRASH_DIR = "trash/scripts";

/** 回收站中的脚本:原脚本 + 删除元数据 */
export interface TrashScript extends Script {
  /** 进入回收站的时间戳(毫秒) */
  deleteTime: number;
  /** 删除来源 */
  deleteBy: InstallSource;
}

interface TrashScriptFile {
  script: TrashScript;
  code?: string;
}

interface IterableDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
}

async function getTrashDir(): Promise<FileSystemDirectoryHandle> {
  let dir = await navigator.storage.getDirectory();
  for (const part of TRASH_DIR.split("/")) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

function filename(uuid: string): string {
  return `${encodeURIComponent(uuid)}.json`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

/** 回收站专用 OPFS DAO。脚本元数据与代码均不进入 chrome.storage.local。 */
export class TrashScriptDAO {
  public useCache = false;

  private cache?: Map<string, TrashScriptFile>;

  private cacheLoaded = false;

  public enableCache(): void {
    this.useCache = true;
  }

  private async readFile(uuid: string): Promise<TrashScriptFile | undefined> {
    const cached = this.cache?.get(uuid);
    if (this.useCache && cached) return clone(cached);
    try {
      const dir = await getTrashDir();
      const handle = await dir.getFileHandle(filename(uuid));
      const data = JSON.parse(await (await handle.getFile()).text()) as TrashScriptFile;
      if (this.useCache) {
        this.cache ??= new Map();
        this.cache.set(uuid, data);
      }
      return clone(data);
    } catch (error) {
      if (isNotFoundError(error)) return undefined;
      throw error;
    }
  }

  private async writeFile(uuid: string, data: TrashScriptFile): Promise<void> {
    const dir = await getTrashDir();
    const handle = await dir.getFileHandle(filename(uuid), { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(data));
    await writable.close();
    if (this.useCache) {
      this.cache ??= new Map();
      this.cache.set(uuid, clone(data));
    }
  }

  private async loadAll(): Promise<Map<string, TrashScriptFile>> {
    if (this.useCache && this.cacheLoaded && this.cache) {
      return this.cache;
    }
    const result = new Map<string, TrashScriptFile>();
    const dir = await getTrashDir();
    for await (const [name, handle] of (dir as unknown as IterableDirectoryHandle).entries()) {
      if (handle.kind !== "file" || !name.endsWith(".json")) continue;
      const fileHandle = handle as FileSystemFileHandle;
      const data = JSON.parse(await (await fileHandle.getFile()).text()) as TrashScriptFile;
      result.set(data.script.uuid, data);
    }
    if (this.useCache) {
      this.cache = result;
      this.cacheLoaded = true;
    }
    return result;
  }

  public async save(val: TrashScript, code?: string): Promise<TrashScript> {
    const old = code === undefined ? await this.readFile(val.uuid) : undefined;
    await this.writeFile(val.uuid, { script: val, code: code ?? old?.code });
    return val;
  }

  public async get(key: string): Promise<TrashScript | undefined> {
    return (await this.readFile(key))?.script;
  }

  public async getCode(key: string): Promise<string | undefined> {
    return (await this.readFile(key))?.code;
  }

  public async gets(keys: string[]): Promise<(TrashScript | undefined)[]> {
    return Promise.all(keys.map((key) => this.get(key)));
  }

  public async find(filters?: (key: string, value: TrashScript) => boolean): Promise<TrashScript[]> {
    const result: TrashScript[] = [];
    for (const [key, data] of await this.loadAll()) {
      if (!filters || filters(key, data.script)) result.push(clone(data.script));
    }
    return result;
  }

  public async all(): Promise<TrashScript[]> {
    return this.find();
  }

  public async findOne(filters?: (key: string, value: TrashScript) => boolean): Promise<TrashScript | undefined> {
    return (await this.find(filters))[0];
  }

  public findByNameAndNamespace(name: string, namespace: string): Promise<TrashScript | undefined> {
    return this.findOne((_key, value) => value.name === name && (!namespace || value.namespace === namespace));
  }

  public async delete(key: string): Promise<void> {
    const dir = await getTrashDir();
    try {
      await dir.removeEntry(filename(key));
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
    this.cache?.delete(key);
  }

  public async deletes(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.delete(key)));
  }
}
