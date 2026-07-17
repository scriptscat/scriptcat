import { type Group } from "@Packages/message/server";
import { type Logger, LoggerDAO } from "@App/app/repo/logger";
import { type SystemConfig } from "@App/pkg/config/config";
import LoggerCore from "@App/app/logger/core";

const DAY_MS = 24 * 60 * 60 * 1000;

// 日志查询服务：供页面通过消息读取/删除/清空本地日志（写入仍走 MessageWriter -> manager.logger）
export class LogService {
  private logger = LoggerCore.logger().with({ service: "log" });

  constructor(
    private group: Group,
    private systemConfig: SystemConfig,
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

  async cleanupExpiredLogs(now = Date.now()): Promise<void> {
    const retentionDays = await this.systemConfig.getLogCleanCycle();
    if (retentionDays <= 0) return;
    const count = await this.logDAO.deleteBefore(now - retentionDays * DAY_MS);
    if (!count) return;
    this.logger.info("cleanup expired logs", { count, retentionDays });
  }

  init() {
    this.group.on("getLogs", this.getLogs.bind(this));
    this.group.on("deleteLogs", this.deleteLogs.bind(this));
    this.group.on("clearLogs", this.clearLogs.bind(this));
  }
}
