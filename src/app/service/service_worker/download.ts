import { stackAsyncTask } from "@App/pkg/utils/async_queue";

type FilenameConflictAction = `${chrome.downloads.FilenameConflictAction}`;
type DownloadOptions = chrome.downloads.DownloadOptions;
type InterruptReason = `${chrome.downloads.InterruptReason}`;

// https://developer.chrome.com/docs/extensions/reference/api/downloads?hl=en#event-onDeterminingFilename
const onDeterminingFilename = (
  downloadItem: chrome.downloads.DownloadItem,
  suggest: (suggestion?: chrome.downloads.FilenameSuggestion) => void
) => {
  // 只处理本扩展发起的下载，避免覆盖用户或其他扩展创建的下载任务。
  if (downloadItem.byExtensionId !== chrome.runtime.id) {
    // Each listener must call suggest exactly once, either synchronously or asynchronously.
    suggest();
    return false;
  }
  let called = false;
  stackAsyncTask("browser_api_download", () => {
    try {
      const id = downloadItem.id;
      const entity = requestMap.get(id);
      if (entity && !responseMap.has(id)) {
        // just before saving. totalBytes and fileSize are known. bytesReceived = 0
        responseMap.set(id, {
          downloadItem: {
            bytesReceived: downloadItem.bytesReceived,
            fileSize: downloadItem.fileSize,
            totalBytes: downloadItem.totalBytes,
          },
        });
      }
      const pendingOverride = entity?.nameOverride;
      if (pendingOverride) {
        // 文件名只需要在 onDeterminingFilename 消费一次；同一下载的后续事件仍保留 callback。
        entity.nameOverride = null;
        // Chrome 建议用 suggest 改文件名，而不是只依赖 downloadOptions.filename。
        // 这样可以稳定处理 blob: URL、data: URL 等最终文件名不明确的下载。
        // 注：filename is ignored if there are any onDeterminingFilename listeners registered by any extensions.
        suggest({
          filename: pendingOverride.filename,
          // 默认 "uniquify"：若存在同名文件，浏览器会自动追加 "(1)"。
          conflictAction: pendingOverride.conflictAction,
        });
        called = true;
      }
    } catch {
      // ignored
    }
    // 与当前逻辑无关的下载也必须调用 suggest，否则 Chrome 会认为事件未被消费。
    if (!called) {
      suggest();
      called = true;
    }
  });
  // 如 suggest 已被调用，则回传 false
  if (called) return false;
  // 返回 true 表示会异步调用 suggest；否则 Chrome 可能提前结束文件名决策。
  return true;
};

const requestMap = new Map<
  number,
  {
    // 下载状态回调；下载完成或中断后会移除，避免 service worker 长期持有引用。
    callback: ((o: DownloadCallback) => any) | null;
    // 待覆盖的目标文件名。只能消费一次，否则同一下载的重复事件可能重复 suggest。
    nameOverride: {
      filename: string;
      conflictAction: FilenameConflictAction;
    } | null;
  }
>();

const responseMap = new Map<
  number,
  {
    downloadItem: Partial<chrome.downloads.DownloadItem>;
  }
>();

const STATE = {
  IN_PROGRESS: "in_progress",
  INTERRUPTED: "interrupted",
  COMPLETE: "complete",
} as const;

type STATE = ValueOf<typeof STATE>;

export type DownloadCallback = {
  downloadId: number;
  state: STATE | "save_cancelled";
  loaded?: number;
  total?: number;
};

const notifyDownloadCallback = async (callback: ((o: DownloadCallback) => any) | null, payload: DownloadCallback) => {
  try {
    await callback?.(payload);
  } catch (e) {
    // 调用方回调失败不应破坏下载事件队列；下载记录已在调用前清理。
    console.error("download callback error:", e);
  }
};

const onChangedListener = (downloadDelta: chrome.downloads.DownloadDelta) => {
  const lastError = chrome.runtime.lastError;
  if (lastError) {
    console.error("chrome.runtime.lastError in chrome.downloads.onChanged:", lastError);
    return;
  }
  stackAsyncTask("browser_api_download", async () => {
    const id = downloadDelta.id;
    const entry = requestMap.get(id);
    if (!entry) return;
    const state = downloadDelta.state?.current;
    if (state === STATE.COMPLETE || state === STATE.INTERRUPTED) {
      try {
        // 查询最终的 DownloadItem，以便：
        //  1) 在 responseMap 尚未填充时补齐 totalBytes/fileSize/bytesReceived；
        //  2) 拿到权威的 error 字段，用于区分用户取消(saveAs / 主动取消)与其他中断。
        // 仅当本次 delta 携带 error 信息或 responseMap 未填充时才发起 search，
        // 避免对每个 delta 都额外调用 chrome.downloads.search 造成不必要开销。
        let interruptError: InterruptReason | undefined = downloadDelta.error?.current as InterruptReason | undefined;
        const needSearch = !responseMap.has(id) || (state === STATE.INTERRUPTED && interruptError === undefined);
        if (needSearch) {
          const downloadItem = (await chrome.downloads.search({ id: id }))?.[0];
          if (downloadItem && downloadItem.id === id) {
            if (!responseMap.has(id)) {
              responseMap.set(id, {
                downloadItem: {
                  bytesReceived: downloadItem.bytesReceived,
                  fileSize: downloadItem.fileSize,
                  totalBytes: downloadItem.totalBytes,
                },
              });
            }
            if (state === STATE.INTERRUPTED && interruptError === undefined && downloadItem.error) {
              interruptError = downloadItem.error as InterruptReason;
            }
          }
        }

        const downloadItem = responseMap.get(id);

        // save_cancelled 仅在 chrome 报告 USER_CANCELED 时回报。
        // 早期版本用 “interrupted + 已触发过 onDeterminingFilename” 推断，但
        // onDeterminingFilename 对普通下载也会先触发，NETWORK_FAILED 等中断会被误报。
        const isSaveCancelled = state === STATE.INTERRUPTED && interruptError === "USER_CANCELED";

        await notifyDownloadCallback(entry.callback, {
          downloadId: id,
          state: isSaveCancelled ? "save_cancelled" : state,
          loaded: downloadItem?.downloadItem?.totalBytes, // 兼容 TM，总是传回 totalBytes （与实际有否储存无关）
          total: downloadItem?.downloadItem?.totalBytes,
        });
      } finally {
        detachDownloadCallback(id); // 通知完成后再清理 requestMap/responseMap
      }
    }
  });
};

const attachDownloadCallback = async () => {
  try {
    // 先移除再注册，防止 service worker 重载或测试重复导入时产生重复监听。
    chrome.downloads.onDeterminingFilename.removeListener(onDeterminingFilename);
    chrome.downloads.onChanged.removeListener(onChangedListener);
  } catch {
    // ignored
  }
  chrome.downloads.onDeterminingFilename.addListener(onDeterminingFilename);
  chrome.downloads.onChanged.addListener(onChangedListener);
};

export const detachDownloadCallback = async (downloadId: number | undefined = undefined) => {
  if (downloadId !== undefined) {
    requestMap.delete(downloadId);
    responseMap.delete(downloadId);
  }
  if (requestMap.size === 0) {
    // 没有待跟踪下载时及时卸载监听，减少后台常驻逻辑和误处理其他下载的风险。
    chrome.downloads.onDeterminingFilename.removeListener(onDeterminingFilename);
    chrome.downloads.onChanged.removeListener(onChangedListener);
  }
};

export const startDownload = async (
  downloadOptions: DownloadOptions,
  callback: ((o: DownloadCallback) => any) | null = null
) => {
  let mDownloadId: number | undefined = undefined;
  if (requestMap.size === 0) {
    attachDownloadCallback();
  }
  try {
    mDownloadId = await stackAsyncTask("browser_api_download", async () => {
      // chrome.downloads.download 会先返回 id，随后才触发 onDeterminingFilename/onChanged。
      // 因此拿到 id 后立即登记，后续事件才能找到对应的回调和文件名覆盖信息。
      const id = await chrome.downloads.download(downloadOptions);
      id &&
        requestMap.set(id, {
          callback,
          nameOverride:
            downloadOptions.filename && typeof downloadOptions.filename === "string"
              ? {
                  filename: downloadOptions.filename,
                  conflictAction: downloadOptions.conflictAction || "uniquify",
                }
              : null,
        });
      return id;
    });
  } catch (e) {
    console.error(e);
  }
  if (chrome.runtime.lastError) {
    console.error("chrome.runtime.lastError in chrome.downloads.download", chrome.runtime.lastError);
    // 若 chrome 在拿到 id 后又设置了 lastError（罕见但可能的实现差异），
    // 仍需把已登记的 id 从 requestMap/responseMap 中清理，避免监听挂住。
    // detachDownloadCallback(id) 会 delete 对应条目，并在 requestMap 清空时移除全局监听。
    if (mDownloadId !== undefined) {
      await detachDownloadCallback(mDownloadId);
    }
    mDownloadId = undefined;
  }
  if (mDownloadId === undefined) await detachDownloadCallback();
  return mDownloadId;
};
