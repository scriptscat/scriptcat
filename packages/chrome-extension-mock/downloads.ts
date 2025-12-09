export default class Downloads {
  onChangedCallback: ((downloadDelta: chrome.downloads.DownloadDelta) => void) | null = null;

  onChanged = {
    addListener: (callback: (downloadDelta: chrome.downloads.DownloadDelta) => void) => {
      this.onChangedCallback = callback;
    },
    removeListener: (_callback: (downloadDelta: chrome.downloads.DownloadDelta) => void) => {
      this.onChangedCallback = null;
    },
  };

  download(_: any, callback: (downloadId: number) => void) {
    callback && callback(1);
    this.onChangedCallback?.({
      id: 1,
      state: { current: "complete" },
    });
  }
}
