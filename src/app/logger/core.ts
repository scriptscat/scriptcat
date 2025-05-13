import Logger from "./logger";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface LogLabel {
  [key: string]: string | string[] | boolean | number | object | undefined;
  component?: string;
}

// 储存
export interface Writer {
  write(level: LogLevel, message: string, label: LogLabel): void;
}

export class EmptyWriter implements Writer {
  write(): void {}
}

export default class LoggerCore {
  static instance: LoggerCore;

  static getInstance() {
    return LoggerCore.instance;
  }

  static logger(...label: LogLabel[]) {
    return LoggerCore.getInstance().logger(...label);
  }

  writer: Writer;

  // 日志级别, 会记录在日志文件中
  level: LogLevel = "info";

  // 日志debug等级, 会在控制台输出
  debug: LogLevel | "none" = "none";

  labels: LogLabel;

  constructor(config: { level?: LogLevel; writer: Writer; labels: LogLabel }) {
    this.writer = config.writer;
    this.level = config.level || this.level;
    this.labels = config.labels || {};
    // 获取日志debug等级, 如果是开发环境, 则默认为debug
    if (process.env.NODE_ENV === "development") {
      this.debug = "debug";
    }
    if (!LoggerCore.instance) {
      LoggerCore.instance = this;
    }
  }

  logger(...label: LogLabel[]) {
    return new Logger(this, this.labels, ...label);
  }
}
