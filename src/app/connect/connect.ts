// eslint-disable-next-line no-unused-vars
export type Handler = (action: string, data: any) => void | Promise<any>;

export type Target = { tag: string; id?: number[] };

export type SendResponse = (data: any) => void;

// eslint-disable-next-line no-unused-vars
export type StreamHandler = (data: any) => void;

export type StreamCatch = (err: string) => void;

export class Stream {
  handler: StreamHandler;

  catch: StreamCatch;

  constructor(handler: StreamHandler, catchError: StreamCatch) {
    this.handler = handler;
    this.catch = catchError;
  }
}

export interface Connect {
  send(action: string, data: any): void;
  // 发送有返回的异步消息
  syncSend(action: string, data: any): Promise<any>;
  setHandler(action: string, handler: Handler): void;
}
