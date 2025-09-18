import type { LogLabel, LogLevel, Writer } from "./core";
import type { MessageSend } from "@Packages/message/types";

// 通过通讯机制写入日志
export default class MessageWriter implements Writer {
  send: MessageSend;

  constructor(
    send: MessageSend,
    private action: string = "logger"
  ) {
    this.send = send;
  }

  write(level: LogLevel, message: string, label: LogLabel): void {
    this.send.sendMessage({
      action: this.action,
      data: {
        id: 0,
        level,
        message,
        label,
        createtime: Date.now(),
      },
    });
  }
}
