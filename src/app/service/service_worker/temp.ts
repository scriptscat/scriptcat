import { TempStorageDAO, TempStorageItemType } from "@App/app/repo/tempStorage";
import { removeCachedCodes } from "@App/pkg/utils/scriptInstall";

// 清除过期的临时安装信息，仅在 SW 中调用
export const cleanupStaleTempStorageEntries = async () => {
  const dao = new TempStorageDAO();
  const stales = await dao.staleEntries();
  if (!stales.length) return;
  const list = stales.map((e) => e.key);
  const codeKeys = stales.filter((e) => e.type === TempStorageItemType.tempCode).map((e) => e.key);
  await removeCachedCodes(codeKeys);
  await dao.deletes(list);
};
