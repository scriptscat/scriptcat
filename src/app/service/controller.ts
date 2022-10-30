import LoggerCore from "../logger/core";
import Logger from "../logger/logger";
import MessageInternal from "../message/internal";

export type Handler = (data: any) => void | Promise<any>;

export default abstract class Controller {
  message: MessageInternal;

  name: string;

  logger: Logger;

  constructor(message: MessageInternal, name: string) {
    this.message = message;
    this.name = name;
    this.logger = LoggerCore.getLogger({
      component: this.name,
      controller: true,
    });
  }

  public dispatchEvent(event: string, data: any): Promise<any> {
    return this.message.syncSend(`${this.name}-${event}`, data);
  }
}
