import Logger from "./logger";

export type LogLevel = "none" | "trace" | "debug" | "info" | "warn" | "error";

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
  level: LogLevel;

  // 打印在console的等级, 会在控制台输出
  consoleLevel: LogLevel;

  labels: LogLabel;

  constructor(config: { level?: LogLevel; consoleLevel?: LogLevel; writer: Writer; labels: LogLabel }) {
    const isDevelopment = process.env.NODE_ENV === "development";
    this.writer = config.writer;
    this.level = config.level ?? (isDevelopment ? "debug" : "info");
    this.consoleLevel = config.consoleLevel ?? (isDevelopment ? "debug" : "warn");
    this.labels = config.labels;
    if (!LoggerCore.instance) {
      LoggerCore.instance = this;
    }
  }

  logger(...label: LogLabel[]) {
    return new Logger(this, this.labels, ...label);
  }
}
