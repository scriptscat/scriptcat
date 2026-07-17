import { uuidv4 } from "@App/pkg/utils/uuid";
import { cacheInstance } from "@App/app/cache";
import { CACHE_KEY_IMPORT_FILE } from "@App/app/cache_key";
import { makeBlobURL, openInCurrentTab } from "@App/pkg/utils/utils";

/**
 * 打开导入窗口：通过 cache 传递文件数据（经扩展 API，兼容 Edge Android）。
 */
export async function openImportWindow(filename: string, file: Blob) {
  const url = makeBlobURL({ blob: file, persistence: true }) as string;
  const uuid = uuidv4();
  const cacheKey = `${CACHE_KEY_IMPORT_FILE}${uuid}`;
  await cacheInstance.set(cacheKey, { filename, url });
  await openInCurrentTab(`/src/import.html?uuid=${uuid}`);
}
