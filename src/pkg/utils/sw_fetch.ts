import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { urlSanitize } from "@App/pkg/utils/utils";

export const swFetch = (input: string | URL | Request, init?: RequestInit) => {
  let url;
  if (typeof input === "string") {
    url = input;
  } else if (typeof (input as any)?.href === "string") {
    url = (input as any).href;
  } else if (typeof (input as any)?.url === "string") {
    url = (input as any).url;
  }
  let stdUrl;
  if (url) {
    try {
      stdUrl = urlSanitize(url);
    } catch {
      // ignored
    }
  }
  if (!stdUrl) return fetch(input, init);
  // 鎖一下 nwRequest 防止與 GM_xhr 竞争

  return stackAsyncTask(`nwRequest::${stdUrl}`, () => fetch(input, init));
};
