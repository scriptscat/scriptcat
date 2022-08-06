import ConnectCenter from "./connect/center";

// eslint-disable-next-line no-unused-vars
type Handler = (data: any) => void | Promise<any>;

export default class Manager {
  center: ConnectCenter;

  constructor(center: ConnectCenter) {
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
