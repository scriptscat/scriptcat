// eslint-disable-next-line no-unused-vars
export type Handler = (action: string, data: any) => void | Promise<any>;

export type Target = { tag: string; id?: number[] };

// eslint-disable-next-line no-unused-vars
export type StreamHandler = (data: any) => void;

export class Stream {
  handler: StreamHandler;

  constructor(handler: StreamHandler) {
    this.handler = handler;
  }
}
