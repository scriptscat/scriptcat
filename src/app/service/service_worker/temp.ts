import { cacheInstance } from "@App/app/cache";
import { TEMP_ENTRY_MIN_TIME, TempStorageDAO, TempStorageItemType } from "@App/app/repo/tempStorage";
import { removeCachedCodes } from "@App/pkg/utils/scriptInstall";
import { timeoutExecution } from "@App/pkg/utils/timer";

export const cleanupStaleTempStorageEntries = () => {
  // 清除旧记录
  const delay = Math.floor(5000 * Math.random()) + 10000; // 使用随机时间避免浏览器重启时大量Tabs同时执行清除
  timeoutExecution(
    `cid_100_cleanupStaleTempStorageEntries`,
    () => {
      cacheInstance
        .tx(`keepTemp`, (val: Record<string, number> | undefined, tx) => {
          const now = Date.now();
          const keeps = new Set<string>();
          const out: Record<string, number> = {};
          for (const [k, ts] of Object.entries(val ?? {})) {
            if (ts > 0 && now - ts < TEMP_ENTRY_MIN_TIME) {
              keeps.add(`${k}`);
              out[k] = ts;
            }
          }
          tx.set(out);
          return keeps;
        })
        .then(async (keeps) => {
          const stales = await new TempStorageDAO().staleEntries(keeps);
          if (stales.length) {
            // 清理缓存
            const list = stales.map((e) => e.key);
            const list1 = stales.filter((entry) => entry.type === TempStorageItemType.tempCode).map((e) => e.key);
            await removeCachedCodes(list1);
            cacheInstance.dels(list);
          }
        });
    },
    delay
  );
};
