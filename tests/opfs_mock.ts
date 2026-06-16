// OPFS mock - 内存中模拟 FileSystem API
const opfsMockStorage: Record<string, Record<string, string>> = {};

class MockFileSystemWritableFileStream {
  private _dirName: string;
  private _fileName: string;
  constructor(dirName: string, fileName: string) {
    this._dirName = dirName;
    this._fileName = fileName;
  }
  async write(data: string) {
    if (!opfsMockStorage[this._dirName]) opfsMockStorage[this._dirName] = {};
    opfsMockStorage[this._dirName][this._fileName] = data;
  }
  async close() {}
}

class MockFileSystemFileHandle {
  private _dirName: string;
  private _fileName: string;
  constructor(dirName: string, fileName: string) {
    this._dirName = dirName;
    this._fileName = fileName;
  }
  async createWritable(_opts?: { keepExistingData: boolean }) {
    return new MockFileSystemWritableFileStream(this._dirName, this._fileName);
  }
  async getFile() {
    const content = opfsMockStorage[this._dirName]?.[this._fileName] ?? "";
    return { text: async () => content };
  }
}

class MockFileSystemDirectoryHandle {
  private _name: string;
  constructor(name: string) {
    this._name = name;
  }
  async getDirectoryHandle(name: string, opts?: { create: boolean }) {
    if (!opts?.create && !opfsMockStorage[name]) {
      throw new DOMException("NotFoundError");
    }
    if (opts?.create && !opfsMockStorage[name]) {
      opfsMockStorage[name] = {};
    }
    return new MockFileSystemDirectoryHandle(name);
  }
  async getFileHandle(name: string, opts?: { create: boolean }) {
    if (!opts?.create && !opfsMockStorage[this._name]?.[name]) {
      throw new DOMException("NotFoundError");
    }
    return new MockFileSystemFileHandle(this._name, name);
  }
  async removeEntry(name: string) {
    if (opfsMockStorage[this._name]) {
      delete opfsMockStorage[this._name][name];
    }
  }
}

export function installOPFSMock() {
  Object.defineProperty(navigator, "storage", {
    value: {
      getDirectory: async () => new MockFileSystemDirectoryHandle("opfs-root"),
    },
    writable: true,
  });
}

export function clearOPFSMock() {
  for (const key of Object.keys(opfsMockStorage)) {
    delete opfsMockStorage[key];
  }
}
