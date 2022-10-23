import { MessageHander } from "../message/message";

export type Handler = (data: any) => void | Promise<any>;

export default class Manager {
  message: MessageHander;

  constructor(message: MessageHander) {
    this.message = message;
  }

  public listenEvent(action: string, func: Handler) {
    this.message.setHandler(action, (_action: string, data: any) => {
      return new Promise((resolve) => {
        resolve(func(data));
      });
    });
  }
}
