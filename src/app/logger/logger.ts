import type { LogLabel, LogLevel } from "./core";
import type LoggerCore from "./core";
import { dayFormat } from "@App/pkg/utils/day_format";

const levelNumber: { [key in LogLevel]: number } = {
  none: 0,
  trace: 10,
  debug: 100,
  info: 1000,
  warn: 10000,
  error: 100000,
};

function buildLabel(...label: LogLabel[][]): LogLabel {
  const ret: LogLabel = {};
  label.forEach((item) => {
    item.forEach((item2) => {
      Object.keys(item2).forEach((key) => {
        ret[key] = item2[key];
      });
    });
  });
  return ret;
}

export default class Logger {
  core: LoggerCore;

  label: LogLabel[];

  constructor(core: LoggerCore, ...label: LogLabel[]) {
    this.core = core;
    this.label = label;
  }

  log(level: LogLevel, message: string, ...label: LogLabel[]) {
    const newLabel = buildLabel(this.label, label);
    if (levelNumber[level] >= levelNumber[this.core.level]) {
      this.core.writer.write(level, message, newLabel);
    }
    let labelJson;
    try {
      labelJson = JSON.stringify(newLabel);
    } catch (e) {
      labelJson = newLabel;
      console.error("Logger label JSON stringify error:", e);
    }
    if (this.core.consoleLevel !== "none" && levelNumber[level] >= levelNumber[this.core.consoleLevel]) {
      if (typeof message === "object") {
        message = JSON.stringify(message);
      }
      const msg = `${dayFormat(new Date(), "YYYY-MM-DD HH:mm:ss")} [${level}] ${message}`;
      switch (level) {
        case "error":
          console.error(msg, labelJson);
          break;
        case "warn":
          console.warn(msg, labelJson);
          break;
        case "trace":
          console.info(msg, labelJson);
          break;
        default:
          console.info(msg, labelJson);
          break;
      }
    }
  }

  with(...label: LogLabel[]) {
    return new Logger(this.core, ...this.label, ...label);
  }

  trace(message: string, ...label: LogLabel[]) {
    this.log("trace", message, ...label);
  }

  debug(message: string, ...label: LogLabel[]) {
    this.log("debug", message, ...label);
  }

  info(message: string, ...label: LogLabel[]) {
    this.log("info", message, ...label);
  }

  warn(message: string, ...label: LogLabel[]) {
    this.log("warn", message, ...label);
  }

  error(message: string, ...label: LogLabel[]) {
    this.log("error", message, ...label);
  }

  static E(e: unknown): LogLabel {
    if (typeof e === "string") {
      return { error: e };
    }
    if (e instanceof Error) {
      console.error(e);
      return { error: e.message };
    }
    if (typeof e === "object") {
      return e as never;
    }
    return {};
  }
}
