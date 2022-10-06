import { LoggerDAO } from "../repo/logger";
import { LogLabel, LogLevel, Writer } from "./core";

// 使用indexdb作为日志存储
export default class DBWriter implements Writer {
  dao: LoggerDAO;

  constructor(dao: LoggerDAO) {
    this.dao = dao;
  }

  write(level: LogLevel, message: string, label: LogLabel): void {
    this.dao.save({
      id: 0,
      level,
      message,
      label,
      createtime: new Date().getTime(),
    });
  }
}
