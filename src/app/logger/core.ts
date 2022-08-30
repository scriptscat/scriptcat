import Logger from "./logger";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogLabel {
  [key: string]: string | boolean | number | undefined;
  component?: string;
}

// 储存
export interface Writer {
  write(level: LogLevel, message: string, label: LogLabel): void;
}

export default class LoggerCore {
  static instance: LoggerCore;

  static getInstance() {
    return LoggerCore.instance;
  }

  writer: Writer;

  level: LogLevel = "info";

  debug: boolean = false;

  constructor(config: { level?: LogLevel; debug?: boolean; writer: Writer }) {
    this.writer = config.writer;
    this.level = config.level || this.level;
    this.debug = config.debug || this.debug;
    if (!LoggerCore.instance) {
      LoggerCore.instance = this;
    }
  }

  logger(...label: LogLabel[]) {
    return new Logger(this, ...label);
  }
}
