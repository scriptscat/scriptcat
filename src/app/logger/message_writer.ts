import MessageCenter from "../message/center";
import { MessageManager } from "../message/message";
import { Logger, LoggerDAO } from "../repo/logger";
import { LogLabel, LogLevel, Writer } from "./core";

// 通过通讯机制写入日志
export default class MessageWriter implements Writer {
  connect: MessageManager;

  constructor(connect: MessageManager) {
    this.connect = connect;
  }

  write(level: LogLevel, message: string, label: LogLabel): void {
    this.connect.send("log", {
      id: 0,
      level,
      message,
      label,
      createtime: new Date().getTime(),
    });
  }
}

export function ListenerMessage(db: LoggerDAO, connect: MessageCenter) {
  connect.setHandler("log", (action, data: Logger) => {
    db.save(data);
  });
}
