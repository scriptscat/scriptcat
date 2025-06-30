import { Script } from "@App/app/repo/scripts";
import { extractFavicons } from "@App/pkg/utils/favicon";
import { store } from "./store";
import { scriptSlice } from "./features/script";
import Cache from "@App/app/cache";
import { SystemClient } from "@App/app/service/service_worker/client";
import { message } from "./global";

// 将数组分成指定大小的批次
const chunkArray = <T>(array: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

// 处理单个脚本的favicon
const processScriptFavicon = async (script: Script) => {
  return {
    uuid: script.uuid,
    fav: await Cache.getInstance().getOrSet(`favicon:${script.uuid}`, async () => {
      const icons = await extractFavicons(script.metadata!.match || [], script.metadata!.include || []);
      if (icons.length === 0) return [];

      // 从缓存中获取favicon图标
      const systemClient = new SystemClient(message);
      const newIcons = await Promise.all(
        icons.map((icon) => {
          // 没有的话缓存到本地使用URL.createObjectURL
          if (!icon.icon) {
            return {
              match: icon.match,
              website: icon.website,
              icon: "",
            };
          }
          // 因为需要持久化URL.createObjectURL，所以需要通过调用到offscreen来创建
          return systemClient
            .loadFavicon(icon.icon)
            .then((url) => ({
              match: icon.match,
              website: icon.website,
              icon: url,
            }))
            .catch(() => ({
              match: icon.match,
              website: icon.website,
              icon: "",
            }));
        })
      );
      return newIcons;
    }),
  };
};

// 在scriptSlice创建后处理favicon加载，以批次方式处理
export const loadScriptFavicons = (scripts: Script[]) => {
  const batchSize = 20; // 每批处理20个脚本
  const scriptChunks = chunkArray(scripts, batchSize);
  // 逐批处理脚本
  for (const chunk of scriptChunks) {
    Promise.all(chunk.map(processScriptFavicon)).then((chunkResults) => {
      // 每完成一批就更新一次store
      store.dispatch(scriptSlice.actions.setScriptFavicon(chunkResults));
    });
  }
};
