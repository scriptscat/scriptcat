import LoggerCore from "../logger/core";
import Logger from "../logger/logger";
import { MessageHander, MessageSender } from "../message/message";

export type Handler = (data: any, sender: any) => void | Promise<any>;

export default abstract class Manager {
  message: MessageHander;

  name: string;

  logger: Logger;

  constructor(message: MessageHander, name: string) {
    this.message = message;
    this.name = name;
    this.logger = LoggerCore.getLogger({ component: this.name, manager: true });
  }

  public listenEvent(action: string, func: Handler) {
    this.message.setHandler(
      `${this.name}-${action}`,
      (_action: string, data: any, sender: MessageSender) => {
        return new Promise((resolve) => {
          resolve(func(data, sender));
        });
      }
    );
  }
}
