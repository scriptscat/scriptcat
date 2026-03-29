// 设备相关的配置项，存储在 chrome.storage.local 而非 sync
// 这些配置不应跨设备同步（如云同步认证、VSCode 连接、UI 布局等）
export const STORAGE_LOCAL_KEYS: Set<string> = new Set([
  "cloud_sync", // 云同步配置（token 存在本地，不应跨设备同步）
  "backup", // 备份配置（含设备相关 filesystem params）
  "cat_file_storage", // CAT 文件存储配置
  "vscode_url", // VSCode 连接地址（设备相关）
  "vscode_reconnect", // VSCode 自动重连
  "language", // 语言偏好（可能因设备不同）
  "script_list_column_width", // UI 列宽（取决于屏幕尺寸）
  "check_update", // 扩展更新通知及已读状态（各设备已读状态独立）
  "enable_script", // 全局脚本开关（设备独立）
  "enable_script_incognito", // 隐身模式开关（浏览器级别）
]);
