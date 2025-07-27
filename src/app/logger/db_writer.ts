import type { LoggerDAO } from "../repo/logger";
import type { LogLabel, LogLevel, Writer } from "./core";

// 使用indexdb作为日志存储
export default class DBWriter implements Writer {
  dao: LoggerDAO;

  constructor(dao: LoggerDAO) {
    this.dao = dao;
  }

  async write(level: LogLevel, message: string, label: LogLabel): Promise<void> {
    try {
      await this.dao.save({
        id: 0,
        level,
        message,
        label,
        createtime: Date.now(),
      });
    } catch (e) {
      console.error("DBWriter error", e);
    }
  }
}
