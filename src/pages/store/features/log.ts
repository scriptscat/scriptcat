import type { Logger } from "@App/app/repo/logger";
import { logClient } from "./script";

// 通过 serviceWorker 的 LogService 读取/删除/清空本地日志（页面不直接访问 Dexie）
export const fetchLogs = (start: number, end: number): Promise<Logger[]> => logClient.getLogs(start, end);

export const requestDeleteLogs = (ids: number[]): Promise<void> => logClient.deleteLogs(ids);

export const requestClearLogs = (): Promise<void> => logClient.clearLogs();
