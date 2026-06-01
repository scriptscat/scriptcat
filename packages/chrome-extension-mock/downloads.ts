import EventEmitter from "eventemitter3";

type DownloadChangedListener = (downloadDelta: chrome.downloads.DownloadDelta) => void;
type DetermineFilenameListener = (
  downloadItem: chrome.downloads.DownloadItem,
  suggest: (suggestion?: chrome.downloads.FilenameSuggestion) => void
) => void | boolean;

type Callback<T> = (value: T) => void;
type DownloadItem = chrome.downloads.DownloadItem & {
  conflictAction?: `${chrome.downloads.FilenameConflictAction}`;
};

export default class Downloads {
  downloadIdAccum: number = 0;
  hook = new EventEmitter<string, any>();
  items = new Map<number, DownloadItem>();
  autoComplete = true;
  autoCompleteDelay = 1;

  onChanged = {
    addListener: (callback: DownloadChangedListener) => {
      this.hook.addListener("onChanged", callback);
    },
    removeListener: (callback: DownloadChangedListener) => {
      this.hook.removeListener("onChanged", callback);
    },
    hasListener: (callback: DownloadChangedListener) => this.hook.listeners("onChanged").includes(callback),
    hasListeners: () => this.hook.listenerCount("onChanged") > 0,
  };

  onDeterminingFilename = {
    addListener: (callback: DetermineFilenameListener) => {
      this.hook.addListener("onDeterminingFilename", callback);
    },
    removeListener: (callback: DetermineFilenameListener) => {
      this.hook.removeListener("onDeterminingFilename", callback);
    },
    hasListener: (callback: DetermineFilenameListener) =>
      this.hook.listeners("onDeterminingFilename").includes(callback),
    hasListeners: () => this.hook.listenerCount("onDeterminingFilename") > 0,
  };

  reset() {
    this.downloadIdAccum = 0;
    this.items.clear();
    this.hook.removeAllListeners();
    this.autoComplete = true;
    this.autoCompleteDelay = 1;
    this.clearLastError();
  }

  download(options: chrome.downloads.DownloadOptions, callback?: Callback<number>) {
    this.clearLastError();
    if (!options?.url) {
      const error = new Error("The download url is required.");
      if (callback) {
        this.withLastError(error.message, () => callback(undefined as unknown as number));
        return;
      }
      return Promise.reject(error);
    }

    const id = ++this.downloadIdAccum;
    const item = this.createDownloadItem(id, options);
    this.items.set(id, item);

    // Chrome 会先把 id 返回给调用方，随后才进入文件名决定和状态变化事件。
    const delayed = async () => {
      await this.determineFilename(item);
      if (this.autoComplete && item.state === "in_progress") {
        this.complete(id);
      }
    };

    if (callback) {
      callback(id);
      setTimeout(delayed, this.autoCompleteDelay);
      return;
    }
    return new Promise<number>((resolve) => {
      resolve(id);
      setTimeout(delayed, this.autoCompleteDelay);
    });
  }

  cancel(downloadId: number, callback?: () => void) {
    this.clearLastError();
    const item = this.items.get(downloadId);
    if (!item) return this.maybeAsync(undefined, callback);
    if (item.state === "in_progress") {
      item.state = "interrupted";
      item.error = "USER_CANCELED";
      item.endTime = new Date().toISOString();
      this.emitChanged({
        id: downloadId,
        state: { previous: "in_progress", current: "interrupted" },
        error: { current: "USER_CANCELED" },
      });
    }
    return this.maybeAsync(undefined, callback);
  }

  search(query: chrome.downloads.DownloadQuery, callback?: Callback<chrome.downloads.DownloadItem[]>) {
    this.clearLastError();
    const result = [...this.items.values()].filter((item) => this.matchQuery(item, query));
    return this.maybeAsync(result, callback);
  }

  erase(query: chrome.downloads.DownloadQuery, callback?: Callback<number[]>) {
    this.clearLastError();
    const ids = [...this.items.values()].filter((item) => this.matchQuery(item, query)).map((item) => item.id);
    ids.forEach((id) => this.items.delete(id));
    return this.maybeAsync(ids, callback);
  }

  pause(downloadId: number, callback?: () => void) {
    this.clearLastError();
    const item = this.items.get(downloadId);
    if (item && item.state === "in_progress" && !item.paused) {
      item.paused = true;
      this.emitChanged({
        id: downloadId,
        paused: { previous: false, current: true },
      });
    }
    return this.maybeAsync(undefined, callback);
  }

  resume(downloadId: number, callback?: () => void) {
    this.clearLastError();
    const item = this.items.get(downloadId);
    if (item && item.paused) {
      item.paused = false;
      this.emitChanged({
        id: downloadId,
        paused: { previous: true, current: false },
      });
    }
    return this.maybeAsync(undefined, callback);
  }

  show(_downloadId: number) {
    this.clearLastError();
  }

  showDefaultFolder() {
    this.clearLastError();
  }

  open(_downloadId: number, callback?: () => void) {
    this.clearLastError();
    return this.maybeAsync(undefined, callback);
  }

  removeFile(_downloadId: number, callback?: () => void) {
    this.clearLastError();
    return this.maybeAsync(undefined, callback);
  }

  complete(downloadId: number) {
    const item = this.items.get(downloadId);
    if (!item || item.state !== "in_progress") return;
    item.state = "complete";
    item.bytesReceived = item.totalBytes >= 0 ? item.totalBytes : item.bytesReceived;
    item.endTime = new Date().toISOString();
    this.emitChanged({
      id: downloadId,
      state: { previous: "in_progress", current: "complete" },
    });
  }

  interrupt(downloadId: number, error: `${chrome.downloads.InterruptReason}` = "NETWORK_FAILED") {
    const item = this.items.get(downloadId);
    if (!item || item.state !== "in_progress") return;
    item.state = "interrupted";
    item.error = error;
    item.endTime = new Date().toISOString();
    this.emitChanged({
      id: downloadId,
      state: { previous: "in_progress", current: "interrupted" },
      error: { current: error },
    });
  }

  private createDownloadItem(id: number, options: chrome.downloads.DownloadOptions): DownloadItem {
    const filename = options.filename || this.inferFilename(options.url);
    return {
      id,
      url: options.url,
      finalUrl: options.url,
      referrer: "",
      filename,
      danger: "safe",
      mime: "",
      startTime: new Date().toISOString(),
      endTime: undefined,
      estimatedEndTime: undefined,
      state: "in_progress",
      paused: false,
      canResume: false,
      error: undefined,
      bytesReceived: 0,
      totalBytes: -1,
      fileSize: -1,
      exists: true,
      byExtensionId: globalThis.chrome?.runtime?.id,
      byExtensionName: "ScriptCat Mock",
      incognito: false,
      conflictAction: options.conflictAction,
    } as DownloadItem;
  }

  private inferFilename(url: string) {
    try {
      const pathname = new URL(url).pathname;
      return decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "download");
    } catch {
      return "download";
    }
  }

  private async determineFilename(item: DownloadItem) {
    const listeners = this.hook.listeners("onDeterminingFilename") as DetermineFilenameListener[];
    if (listeners.length === 0) return;

    const suggestion = await new Promise<chrome.downloads.FilenameSuggestion | undefined>((resolve) => {
      let settled = false;
      const suggest = (value?: chrome.downloads.FilenameSuggestion) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      listeners.forEach((listener) => listener({ ...item } as chrome.downloads.DownloadItem, suggest));
      setTimeout(() => suggest(), 50);
    });

    if (suggestion?.filename) {
      const previous = item.filename;
      item.filename = suggestion.filename;
      item.conflictAction = suggestion.conflictAction;
      this.emitChanged({
        id: item.id,
        filename: { previous, current: suggestion.filename },
      });
    }
  }

  private matchQuery(item: DownloadItem, query: chrome.downloads.DownloadQuery) {
    if (query.id !== undefined && item.id !== query.id) return false;
    if (query.url && item.url !== query.url) return false;
    if (query.filename && item.filename !== query.filename) return false;
    if (query.state && item.state !== query.state) return false;
    return true;
  }

  private emitChanged(delta: chrome.downloads.DownloadDelta) {
    this.hook.emit("onChanged", delta);
  }

  private maybeAsync<T>(value: T, callback?: Callback<T>) {
    if (callback) {
      callback(value);
      return;
    }
    return Promise.resolve(value);
  }

  private withLastError(message: string, fn: () => void) {
    (
      globalThis.chrome.runtime as typeof chrome.runtime & {
        lastError?: chrome.runtime.LastError;
      }
    ).lastError = {
      message,
    };
    try {
      fn();
    } finally {
      this.clearLastError();
    }
  }

  private clearLastError() {
    if (globalThis.chrome?.runtime) {
      delete (
        globalThis.chrome.runtime as typeof chrome.runtime & {
          lastError?: chrome.runtime.LastError;
        }
      ).lastError;
    }
  }
}
