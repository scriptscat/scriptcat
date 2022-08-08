import { LogLabel, LogLevel } from "../logger/core";
import { db, DAO } from "./dao";

export interface Logger {
  id: number;
  level: LogLevel;
  message: string;
  label: LogLabel;
  createtime: number;
}

export class LoggerDAO extends DAO<Logger> {
  public tableName = "logger";

  constructor() {
    super();
    this.table = db.table(this.tableName);
  }
}
