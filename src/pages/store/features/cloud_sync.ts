import ChromeStorage from "@App/pkg/config/chrome_storage";
import { CLOUD_SYNC_STATE_KEY, DEFAULT_CLOUD_SYNC_STATE, type CloudSyncState } from "@App/pkg/config/config";
import { synchronizeClient } from "./script";

// 设备本地同步状态由 SynchronizeService 写入 ChromeStorage("sync") 命名空间（chrome.storage.local）。
// 页面直接读取并订阅 chrome.storage 变更即可，无需经 serviceWorker 消息。
const storage = new ChromeStorage("sync", false);
const RAW_KEY = storage.buildKey(CLOUD_SYNC_STATE_KEY);

export const fetchCloudSyncState = (): Promise<CloudSyncState> =>
  storage.get(CLOUD_SYNC_STATE_KEY).then((v) => (v as CloudSyncState) || DEFAULT_CLOUD_SYNC_STATE);

// 手动触发一次云同步（设置页「立即同步」）
export const requestCloudSyncOnce = (): Promise<void> => synchronizeClient.cloudSyncOnce();

// 订阅同步状态变更，返回取消订阅函数
export const subscribeCloudSyncState = (cb: (state: CloudSyncState) => void): (() => void) => {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === "local" && changes[RAW_KEY]) {
      cb((changes[RAW_KEY].newValue as CloudSyncState) || DEFAULT_CLOUD_SYNC_STATE);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
};
