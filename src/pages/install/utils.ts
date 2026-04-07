import { parseMetadata } from "@App/pkg/utils/script";
import { detectEncoding, bytesDecode } from "@App/pkg/utils/encoding";
import { parseSkillScriptMetadata } from "@App/pkg/utils/skill_script";
import { cacheInstance } from "@App/app/cache";
import { CACHE_KEY_SCRIPT_INFO } from "@App/app/cache_key";
import { timeoutExecution } from "@App/pkg/utils/timer";
import type { SCMetadata } from "@App/app/repo/scripts";

export const cIdKey = `(cid_${Math.random()})`;

export const backgroundPromptShownKey = "background_prompt_shown";

// Types
export interface PermissionItem {
  label: string;
  color?: string;
  value: string[];
}

export type Permission = PermissionItem[];

export const closeWindow = (doBackwards: boolean) => {
  if (doBackwards) {
    history.go(-1);
  } else {
    window.close();
  }
};

export const fetchScriptBody = async (url: string, { onProgress }: { [key: string]: any }) => {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    throw new Error(`Invalid url: ${url}`);
  }
  const response = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache",
      // 参考：加权 Accept-Encoding 值说明
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Accept-Encoding#weighted_accept-encoding_values
      "Accept-Encoding": "br;q=1.0, gzip;q=0.8, *;q=0.1",
      Origin: origin,
    },
    referrer: origin + "/",
  });

  if (!response.ok) {
    throw new Error(`Fetch failed with status ${response.status}`);
  }

  if (!response.body || !response.headers) {
    throw new Error("No response body or headers");
  }
  const reader = response.body.getReader();

  // 读取数据
  let receivedLength = 0; // 当前已接收的长度
  const chunks = []; // 已接收的二进制分片数组（用于组装正文）
  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
    receivedLength += value.length;
    onProgress?.({ receivedLength });
  }

  // 合并分片（chunks）
  const chunksAll = new Uint8Array(receivedLength);
  let position = 0;
  for (const chunk of chunks) {
    chunksAll.set(chunk, position);
    position += chunk.length;
  }

  // 检测编码：优先使用 Content-Type，回退到 chardet（仅检测前16KB）
  const contentType = response.headers.get("content-type");
  const encode = detectEncoding(chunksAll, contentType);

  // 使用检测到的 charset 解码
  let code;
  try {
    code = bytesDecode(encode, chunksAll);
  } catch (e: any) {
    console.warn(`Failed to decode response with charset ${encode}: ${e.message}`);
    // 回退到 UTF-8
    code = new TextDecoder("utf-8").decode(chunksAll);
  }

  const metadata = parseMetadata(code);
  // 如果不是 UserScript，检测是否为 SkillScript
  if (!metadata) {
    const skillScriptMeta = parseSkillScriptMetadata(code);
    if (skillScriptMeta) {
      return { code, metadata: {} as SCMetadata, skillScript: true };
    }
    throw new Error("parse script info failed");
  }

  return { code, metadata };
};

export const cleanupStaleInstallInfo = (uuid: string) => {
  // 页面打开时不清除当前uuid，每30秒更新一次记录
  const f = () => {
    cacheInstance.tx(`scriptInfoKeeps`, (val: Record<string, number> | undefined, tx) => {
      val = val || {};
      val[uuid] = Date.now();
      tx.set(val);
    });
  };
  f();
  setInterval(f, 30_000);

  // 页面打开后清除旧记录
  const delay = Math.floor(5000 * Math.random()) + 10000; // 使用随机时间避免浏览器重启时大量Tabs同时执行清除
  timeoutExecution(
    `${cIdKey}cleanupStaleInstallInfo`,
    () => {
      cacheInstance
        .tx(`scriptInfoKeeps`, (val: Record<string, number> | undefined, tx) => {
          const now = Date.now();
          const keeps = new Set<string>();
          const out: Record<string, number> = {};
          for (const [k, ts] of Object.entries(val ?? {})) {
            if (ts > 0 && now - ts < 60_000) {
              keeps.add(`${CACHE_KEY_SCRIPT_INFO}${k}`);
              out[k] = ts;
            }
          }
          tx.set(out);
          return keeps;
        })
        .then(async (keeps) => {
          const list = await cacheInstance.list();
          const filtered = list.filter((key) => key.startsWith(CACHE_KEY_SCRIPT_INFO) && !keeps.has(key));
          if (filtered.length) {
            // 清理缓存
            cacheInstance.dels(filtered);
          }
        });
    },
    delay
  );
};
