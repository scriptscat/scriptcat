import dayjs from "dayjs";
import LoggerCore, { LogLabel, LogLevel } from "./core";

const levelNumber = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
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
    if (levelNumber[level] >= levelNumber[this.core.level]) {
      this.core.writer.write(level, message, buildLabel(this.label, label));
    }
    if (this.core.debug) {
      // eslint-disable-next-line no-console
      console.trace(
        "%s [%s] component=%s msg=%s label=%s",
        dayjs(new Date()).format("YYYY-MM-DD HH:mm:ss"),
        level,
        message,
        JSON.stringify(buildLabel(this.label, label))
      );
    }
  }

  with(...label: LogLabel[]) {
    return new Logger(this.core, this.component, ...this.label, ...label);
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

  static E(e: any): LogLabel {
    // eslint-disable-next-line no-console
    console.error(e);
    if (typeof e === "string") {
      return { error: e };
    }
    if (e instanceof Error) {
      return { error: e.message, stack: e.stack || "" };
    }
    return {};
  }
}
