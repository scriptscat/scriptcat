import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { chunkUint8, uint8ToBase64 } from "@App/pkg/utils/datatype";
import { bgXhrRequestFn } from "@App/pkg/utils/xhr/xhr_bg_core";
import { type MessageConnect, type TMessageCommAction } from "@Packages/message/types";

/**
 * 把 bgXhrRequestFn 的执行结果通过 MessageConnect 进一步传到 service_worker / offscreen
 * Communicate Network Request in Background
 * @param param1 Input
 * @param inRef Control
 * @param msgConn Connection
 */
export const bgXhrInterface = (param1: any, inRef: any, msgConn: MessageConnect) => {
  const taskId = `${Date.now}:${Math.random()}`;
  let isConnDisconnected = false;
  const settings = {
    onDataReceived: (param: { chunk: boolean; type: string; data: any }) => {
      stackAsyncTask(taskId, async () => {
        if (isConnDisconnected) return;
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
              msgConn.sendMessage(msg);
            }
            for (const chunk of chunks) {
              const msg: TMessageCommAction = {
                action: `append_chunk_${param.type}`,
                data: {
                  chunk: uint8ToBase64(chunk),
                },
              };
              msgConn.sendMessage(msg);
            }
          } else if (typeof param.data === "string") {
            const d = param.data as string;
            const c = 2 * 1024 * 1024;
            if (!param.chunk) {
              const msg: TMessageCommAction = {
                action: `reset_chunk_${param.type}`,
                data: {},
              };
              msgConn.sendMessage(msg);
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
                msgConn.sendMessage(msg);
              }
            }
          }
        } catch (e: any) {
          console.error(e);
        }
      });
    },
    callback: (
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
    ) => {
      const data = {
        ...result,
        finalUrl: inRef.finalUrl,
        responseHeaders: inRef.responseHeaders || result.responseHeaders || "",
      };
      const eventType = result.eventType;
      const msg: TMessageCommAction = {
        action: `on${eventType}`,
        data: data,
      };
      stackAsyncTask(taskId, async () => {
        await inRef.fixMsg?.(msg);
        if (eventType === "loadend") {
          inRef.loadendCleanUp?.();
        }
        if (isConnDisconnected) return;
        msgConn.sendMessage(msg);
      });
    },
  } as Record<string, any> & { abort?: () => void };
  bgXhrRequestFn(param1, settings).catch((e: any) => {
    settings.abort?.();
    console.error(e);
  });
  msgConn.onDisconnect(() => {
    isConnDisconnected = true;
    settings.abort?.();
    // console.warn("msgConn.onDisconnect");
  });
};
