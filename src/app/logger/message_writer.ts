import type { LogLabel, LogLevel, Writer } from "./core";
import type { MessageSend } from "@Packages/message/types";

// 通过通讯机制写入日志
export default class MessageWriter implements Writer {
  constructor(
    private msgSender: MessageSend,
    private action: string = "logger"
  ) {}

  write(level: LogLevel, message: string, label: LogLabel): void {
    this.msgSender.sendMessage({
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
