import type { Script } from "@App/app/repo/scripts";
import { cacheInstance } from "@App/app/cache";
import { message } from "./global";
import { CACHE_KEY_FAVICON } from "@App/app/cache_key";
import { SystemClient } from "@App/app/service/service_worker/client";

// 处理单个脚本的favicon
const processScriptFavicon = async (script: Script) => {
  const cacheKey = `${CACHE_KEY_FAVICON}${script.uuid}`;
  return {
    uuid: script.uuid,
    fav: await cacheInstance.getOrSet(cacheKey, async () => {
      const systemClient = new SystemClient(message);
      const icons = await systemClient.getScriptFavicon(script.uuid);
      if (icons.length === 0) return [];

      const newIcons = await Promise.all(
        icons.map(async (icon) => {
          let iconUrl = "";
          // 没有的话缓存到本地使用URL.createObjectURL
          if (icon.icon) {
            try {
              // 因为需要持久化URL.createObjectURL，所以需要通过调用到offscreen来创建
              iconUrl = await systemClient.loadFavicon({ uuid: script.uuid, url: icon.icon });
            } catch (_) {
              // ignored
            }
          }
          return {
            match: icon.match,
            website: icon.website,
            icon: iconUrl,
          };
        })
      );
      return newIcons;
    }),
  };
};

type FavIconResult = {
  uuid: string;
  fav: {
    match: string;
    website?: string;
    icon?: string;
  }[];
};

// 在scriptSlice创建后处理favicon加载，以批次方式处理
export const loadScriptFavicons = async function* (scripts: Script[]) {
  const stack: any[] = [];
  const asyncWaiter: { promise?: any; resolve?: any } = {};
  const createPromise = () => {
    asyncWaiter.promise = new Promise<{ chunkResults: FavIconResult[]; pendingCount: number }>((resolve) => {
      asyncWaiter.resolve = resolve;
    });
  };
  createPromise();
  let pendingCount = scripts.length;
  if (!pendingCount) return;
  const results: FavIconResult[] = [];
  let waiting = false;
  for (const script of scripts) {
    processScriptFavicon(script).then((result: FavIconResult) => {
      results.push(result);
      // 下一个 MacroTask 执行。
      // 使用 requestAnimationFrame 而非setTimeout 是因为前台才要显示。而且网页绘画中时会延后这个
      if (!waiting) {
        requestAnimationFrame(() => {
          waiting = false;
          const chunkResults: FavIconResult[] = results.slice(0);
          results.length = 0;
          pendingCount -= chunkResults.length;
          stack.push({ chunkResults, pendingCount } as { chunkResults: FavIconResult[]; pendingCount: number });
          asyncWaiter.resolve();
        });
        waiting = true;
      }
    });
  }
  while (true) {
    await asyncWaiter.promise;
    while (stack.length) {
      yield stack.shift();
    }
    if (pendingCount <= 0) break;
    createPromise();
  }
};
