import type { LogLabel, LogLevel } from "../logger/core";
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
    const ret = await this.table.where("createtime").between(startTime, endTime).toArray();

    return ret.sort((a, b) => b.createtime - a.createtime);
  }

  /**
   * 沿 createtime 索引从最新往回逐条读取 createtime ≥ since 的日志，同一毫秒内 id 大（后写入）的在前；
   * visit 返回 false 时停止读取。按标签筛选的调用方据此只读到凑够结果为止，不把整段日志载入内存。
   */
  async walkNewestFirst(since: number, visit: (row: Logger) => boolean): Promise<void> {
    let done = false;
    await this.table
      .where("createtime")
      .aboveOrEqual(since)
      .reverse()
      .until(() => done)
      .each((row) => {
        done = !visit(row);
      });
  }

  deleteBefore(time: number) {
    return this.table.where("createtime").below(time).delete();
  }
}
