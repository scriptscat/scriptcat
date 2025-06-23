import { Script } from "@App/app/repo/scripts";
import { extractFavicons } from "@App/pkg/utils/favicon";
import { store } from "./store";
import { scriptSlice } from "./features/script";
import Cache from "@App/app/cache";
import { SystemClient } from "@App/app/service/service_worker/client";
import { message } from "./global";

// 在scriptSlice创建后处理favicon加载
export const loadScriptFavicons = (scripts: Script[]) => {
  scripts.forEach(async (item) => {
    const icons = await Cache.getInstance().getOrSet(`favicon:${item.uuid}`, () => {
      return extractFavicons(item.metadata!.match || [], item.metadata!.include || []).then(async (icons) => {
        if (icons.length > 0) {
          // 从缓存中获取favicon图标
          const systemClient = new SystemClient(message);
          const newIcons = await Promise.all(
            icons.map((icon) => {
              // 没有的话缓存到本地使用URL.createObjectURL
              if (!icon.icon) {
                return Promise.resolve({
                  match: icon.match,
                  website: icon.website,
                  icon: "",
                });
              }
              // 因为需要持久化URL.createObjectURL，所以需要通过调用到offscreen来创建
              return systemClient
                .loadFavicon(icon.icon)
                .then((url) => {
                  return {
                    match: icon.match,
                    website: icon.website,
                    icon: url,
                  };
                })
                .catch(() => {
                  return {
                    match: icon.match,
                    website: icon.website,
                    icon: "",
                  };
                });
            })
          );
          return newIcons;
        }
        return [];
      });
    });
    store.dispatch(scriptSlice.actions.setScriptFavicon({ uuid: item.uuid, fav: icons }));
  });
};
