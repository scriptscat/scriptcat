import { parseMetadata } from "@App/pkg/utils/script";
import { readRawContent } from "@App/pkg/utils/encoding";
import { parseSkillScriptMetadata } from "@App/pkg/utils/skill_script";
import type { SCMetadata } from "@App/app/repo/scripts";
import { TempStorageDAO } from "@App/app/repo/tempStorage";
import { EnableAgent } from "@App/app/const";

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

  const contentType = response.headers.get("content-type");
  const code = await readRawContent(chunksAll, contentType);

  const metadata = parseMetadata(code);
  // 如果不是 UserScript，检测是否为 SkillScript（仅 agent 启用时）
  if (!metadata) {
    const skillScriptMeta = EnableAgent ? parseSkillScriptMetadata(code) : null;
    if (skillScriptMeta) {
      return { code, metadata: {} as SCMetadata, skillScript: true };
    }
    throw new Error("parse script info failed");
  }

  return { code, metadata };
};

let activeSessionKey = "";
let keepAliveTimerId: ReturnType<typeof setInterval> | number = 0;

const updateSessionTimestamp = () => {
  if (!activeSessionKey) {
    return;
  }
  new TempStorageDAO().update(activeSessionKey, { savedAt: Date.now() });
};

export const startKeepAlive = (key: string) => {
  activeSessionKey = key;
  // 页面打开时不清除当前uuid，每30秒更新一次记录
  updateSessionTimestamp();
  clearInterval(keepAliveTimerId);
  keepAliveTimerId = setInterval(updateSessionTimestamp, 30_000);
};
