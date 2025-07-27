import type { Script } from "@App/app/repo/scripts";
import { extractFavicons } from "@App/pkg/utils/favicon";
import { store } from "./store";
import { scriptSlice } from "./features/script";
import Cache from "@App/app/cache";
import { SystemClient } from "@App/app/service/service_worker/client";
import { message } from "./global";
import { CACHE_KEY_FAVICON } from "@App/app/cache_key";

// 处理单个脚本的favicon
const processScriptFavicon = async (script: Script) => {
  return {
    uuid: script.uuid,
    fav: await Cache.getInstance().getOrSet(`${CACHE_KEY_FAVICON}${script.uuid}`, async () => {
      const icons = await extractFavicons(script.metadata!.match || [], script.metadata!.include || []);
      if (icons.length === 0) return [];

      // 从缓存中获取favicon图标
      const systemClient = new SystemClient(message);
      const newIcons = await Promise.all(
        icons.map(async (icon) => {
          let iconUrl = "";
          // 没有的话缓存到本地使用URL.createObjectURL
          if (icon.icon) {
            try {
              // 因为需要持久化URL.createObjectURL，所以需要通过调用到offscreen来创建
              iconUrl = await systemClient.loadFavicon(icon.icon);
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
export const loadScriptFavicons = (scripts: Script[]) => {
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
          if (!results.length) return;
          const chunkResults: FavIconResult[] = results.slice(0);
          results.length = 0;
          store.dispatch(scriptSlice.actions.setScriptFavicon(chunkResults));
        });
        waiting = true;
      }
    });
  }
};
