import { LogLabel, LogLevel } from "../logger/core";
import { DAO, db } from "./dao";

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

  async queryLogs(startTime: number, endTime: number) {
    const ret = await this.table
      .where("createtime")
      .between(startTime, endTime)
      .toArray();

    return ret.sort((a, b) => b.createtime - a.createtime);
  }

  deleteBefore(time: number) {
    return this.table.where("createtime").below(time).delete();
  }
}
