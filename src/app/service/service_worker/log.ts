import { type Group } from "@Packages/message/server";
import { type Logger, LoggerDAO } from "@App/app/repo/logger";

// 日志查询服务：供页面通过消息读取/删除/清空本地日志（写入仍走 MessageWriter -> manager.logger）
export class LogService {
  constructor(
    private group: Group,
    private logDAO: LoggerDAO = new LoggerDAO()
  ) {}

  getLogs({ start, end }: { start: number; end: number }): Promise<Logger[]> {
    return this.logDAO.queryLogs(start, end);
  }

  async deleteLogs(ids: number[]): Promise<void> {
    await Promise.all(ids.map((id) => this.logDAO.delete(id)));
  }

  async clearLogs(): Promise<void> {
    await this.logDAO.clear();
  }

  init() {
    this.group.on("getLogs", this.getLogs.bind(this));
    this.group.on("deleteLogs", this.deleteLogs.bind(this));
    this.group.on("clearLogs", this.clearLogs.bind(this));
  }
}
