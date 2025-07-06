import { LogLabel, LogLevel, Writer } from "./core";
import { MessageSend } from "@Packages/message/server";

// 通过通讯机制写入日志
export class MessageWriter implements Writer {
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
        createtime: new Date().getTime(),
      },
    });
  }
}
