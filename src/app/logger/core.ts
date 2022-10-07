import Hook from "../service/hook";
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

  static getLogger(...label: LogLabel[]) {
    return LoggerCore.getInstance().logger(...label);
  }

  writer: Writer;

  level: LogLevel = "info";

  debug: boolean = false;

  labels: LogLabel;

  constructor(config: {
    level?: LogLevel;
    debug?: boolean;
    writer: Writer;
    labels: LogLabel;
  }) {
    this.writer = config.writer;
    this.level = config.level || this.level;
    this.debug = config.debug || this.debug;
    this.labels = config.labels || {};
    if (!LoggerCore.instance) {
      LoggerCore.instance = this;
    }
  }

  logger(...label: LogLabel[]) {
    return new Logger(this, this.labels, ...label);
  }

  static hook = new Hook<"log">();
}
