import { LogLabel, LogLevel, Writer } from "./core";
import { MessageSend } from "@Packages/message/server";

// 通过通讯机制写入日志
export default class MessageWriter implements Writer {
  send: MessageSend;

  constructor(connect: MessageSend) {
    this.send = connect;
  }

  write(level: LogLevel, message: string, label: LogLabel): void {
    this.send.sendMessage({
      action: "logger",
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
