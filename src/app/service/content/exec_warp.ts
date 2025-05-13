import { ScriptRunResouce } from "@App/app/repo/scripts";
import ExecScript from "./exec_script";
import { Message } from "@Packages/message/server";

export class CATRetryError {
  msg: string;

  time: Date;

  constructor(msg: string, time: number | Date) {
    this.msg = msg;
    if (typeof time === "number") {
      this.time = new Date(Date.now() + time * 1000);
    } else {
      this.time = time;
    }
  }
}

export class BgExecScriptWarp extends ExecScript {
  setTimeout: Map<number, boolean>;

  setInterval: Map<number, boolean>;

  constructor(scriptRes: ScriptRunResouce, message: Message) {
    const thisContext: { [key: string]: any } = {};
    const setTimeout = new Map<number, any>();
    const setInterval = new Map<number, any>();
    thisContext.setTimeout = function (handler: () => void, timeout: number | undefined, ...args: any) {
      const t = global.setTimeout(
        function () {
          setTimeout.delete(t);
          if (typeof handler === "function") {
            handler();
          }
        },
        timeout,
        ...args
      );
      setTimeout.set(t, true);
      return t;
    };
    thisContext.clearTimeout = function (t: number) {
      setTimeout.delete(t);
      global.clearTimeout(t);
    };
    thisContext.setInterval = function (handler: () => void, timeout: number | undefined, ...args: any) {
      const t = global.setInterval(
        function () {
          if (typeof handler === "function") {
            handler();
          }
        },
        timeout,
        ...args
      );
      setInterval.set(t, true);
      return t;
    };
    thisContext.clearInterval = function (t: number) {
      setInterval.delete(t);
      global.clearInterval(t);
    };
    // @ts-ignore
    thisContext.CATRetryError = CATRetryError;
    super(scriptRes, "offscreen", message, scriptRes.code, thisContext);
    this.setTimeout = setTimeout;
    this.setInterval = setInterval;
  }

  stop() {
    this.setTimeout.forEach((_, t) => {
      global.clearTimeout(t);
    });
    this.setTimeout.clear();
    this.setInterval.forEach((_, t) => {
      global.clearInterval(t);
    });
    this.setInterval.clear();
    return super.stop();
  }
}
