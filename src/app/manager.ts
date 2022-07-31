import ConnectCenter from "./connect/center";

// eslint-disable-next-line no-unused-vars
type Handler = (data: any) => void;

export default class Manager {
  center: ConnectCenter;

  constructor(center: ConnectCenter) {
    this.center = center;
  }

  public listenEvent(action: string, func: Handler) {
    this.center.setHandler(action, (_action: string, data: any) => {
      func(data);
    });
  }
}
