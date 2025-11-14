import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { chunkUint8, uint8ToBase64 } from "@App/pkg/utils/datatype";
import { bgXhrRequestFn } from "@App/pkg/utils/xhr/xhr_bg_core";
import type { MessageConnect, TMessageCommAction } from "@Packages/message/types";
import type { GMXhrStrategy } from "./gm_xhr";

export type RequestResultParams = {
  statusCode: number;
  responseHeaders: string;
  finalUrl: string;
};

// 后台处理端 GM Xhr 实现
export class BgGMXhr {
  private taskId: string;

  private isConnDisconnected: boolean = false;

  constructor(
    private details: GMSend.XHRDetails,
    private resultParams: RequestResultParams,
    private msgConn: MessageConnect,
    private strategy?: GMXhrStrategy
  ) {
    this.taskId = `${Date.now}:${Math.random()}`;
    this.isConnDisconnected = false;
  }

  onDataReceived(param: { chunk: boolean; type: string; data: any }) {
    stackAsyncTask(this.taskId, async () => {
      if (this.isConnDisconnected) return;
      try {
        let buf: Uint8Array<ArrayBufferLike> | undefined;
        // text / stream (uint8array) / buffer (uint8array) / arraybuffer
        if (param.data instanceof Uint8Array) {
          buf = param.data;
        } else if (param.data instanceof ArrayBuffer) {
          buf = new Uint8Array(param.data);
        }

        if (buf instanceof Uint8Array) {
          const d = buf as Uint8Array<ArrayBuffer>;
          const chunks = chunkUint8(d);
          if (!param.chunk) {
            const msg: TMessageCommAction = {
              action: `reset_chunk_${param.type}`,
              data: {},
            };
            this.msgConn.sendMessage(msg);
          }
          for (const chunk of chunks) {
            const msg: TMessageCommAction = {
              action: `append_chunk_${param.type}`,
              data: {
                chunk: uint8ToBase64(chunk),
              },
            };
            this.msgConn.sendMessage(msg);
          }
        } else if (typeof param.data === "string") {
          const d = param.data as string;
          const c = 2 * 1024 * 1024;
          if (!param.chunk) {
            const msg: TMessageCommAction = {
              action: `reset_chunk_${param.type}`,
              data: {},
            };
            this.msgConn.sendMessage(msg);
          }
          for (let i = 0, l = d.length; i < l; i += c) {
            const chunk = d.substring(i, i + c);
            if (chunk.length) {
              const msg: TMessageCommAction = {
                action: `append_chunk_${param.type}`,
                data: {
                  chunk: chunk,
                },
              };
              this.msgConn.sendMessage(msg);
            }
          }
        }
      } catch (e: any) {
        console.error(e);
      }
    });
  }

  callback(
    result: Record<string, any> & {
      //
      finalUrl: string;
      readyState: 0 | 4 | 2 | 3 | 1;
      status: number;
      statusText: string;
      responseHeaders: string;
      //
      useFetch: boolean;
      eventType: string;
      ok: boolean;
      contentType: string;
      error: undefined | string;
    }
  ) {
    const data = {
      ...result,
      finalUrl: this.resultParams.finalUrl,
      responseHeaders: this.resultParams.responseHeaders || result.responseHeaders || "",
    };
    const eventType = result.eventType;
    const msg: TMessageCommAction = {
      action: `on${eventType}`,
      data: data,
    };
    stackAsyncTask(this.taskId, async () => {
      await this.strategy?.fixMsg(msg);
      if (eventType === "loadend") {
        this.onloaded?.();
      }
      if (this.isConnDisconnected) return;
      this.msgConn.sendMessage(msg);
    });
  }

  private onloaded: (() => void) | undefined;

  onLoaded(fn: () => void) {
    this.onloaded = fn;
  }

  do() {
    bgXhrRequestFn(this.details, {
      onDataReceived: this.onDataReceived.bind(this),
      callback: this.callback.bind(this),
    }).catch((e: any) => {
      // settings.abort?.();
      console.error(e);
    });
    this.msgConn.onDisconnect(() => {
      this.isConnDisconnected = true;
      // settings.abort?.();
      // console.warn("msgConn.onDisconnect");
    });
  }
}
