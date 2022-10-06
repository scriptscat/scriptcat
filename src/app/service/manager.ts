import MessageCenter from "../message/center";

type Handler = (data: any) => void | Promise<any>;

export default class Manager {
  center: MessageCenter;

  constructor(center: MessageCenter) {
    this.center = center;
  }

  public listenEvent(action: string, func: Handler) {
    this.center.setHandler(action, (_action: string, data: any) => {
      return new Promise((resolve) => {
        resolve(func(data));
      });
    });
  }
}
