import { Connect, Handler } from "./connect";

// content与页面通讯,使用CustomEvent
export default class ConnectContent implements Connect {
  static instance: ConnectContent;

  static getInstance() {
    return this.instance;
  }

  eventId: string;

  isContent: boolean;

  handler: Map<string, Handler>;

  constructor(eventId: string, isContent: boolean) {
    this.eventId = eventId;
    this.isContent = isContent;
    this.handler = new Map();
    document.addEventListener(
      (isContent ? "ct" : "fd") + eventId,
      (event: unknown) => {
        const { detail } = <{ detail: { data: any; action: string } }>event;
        const handler = this.handler.get(detail.action);
        if (handler) {
          handler(detail.data.action, detail.data.data);
        }
      }
    );
  }

  public send(action: string, data: any) {
    let detail = <{ action: string; data: any }>{
      action,
      data,
    };
    if ((<{ cloneInto: any }>(<unknown>window)).cloneInto) {
      try {
        detail = (<
          {
            cloneInto: (
              // eslint-disable-next-line no-unused-vars, no-shadow
              detail: any,
              // eslint-disable-next-line no-unused-vars
              view: any
            ) => { action: string; data: any };
          }
        >(<unknown>global)).cloneInto(detail, document.defaultView);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(e);
      }
    }
    const ev = new CustomEvent((this.isContent ? "fd" : "ct") + this.eventId, {
      detail,
    });
    document.dispatchEvent(ev);
  }

  public setHandler(action: string, handler: Handler) {
    this.handler.set(action, handler);
  }
}
