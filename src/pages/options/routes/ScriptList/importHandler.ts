import { scriptClient, agentClient } from "@App/pages/store/features/script";
import { saveHandle } from "@App/pkg/utils/filehandle-db";
import { makeBlobURL, openInCurrentTab } from "@App/pkg/utils/utils";
import { parseMetadata } from "@App/pkg/utils/script";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { notify } from "@App/pages/components/ui/toast";
import { t } from "@App/locales/locales";
import { EnableAgent } from "@App/app/const";

export interface ImportItem {
  file: File;
  handle: FileSystemFileHandle | null;
}
export interface ImportStat {
  success: number;
  fail: number;
  messages: string[];
}

// ArrayBuffer → base64(分块,避免 String.fromCharCode 参数过多爆栈)
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function installSkillZip(file: File): Promise<void> {
  const base64 = bufferToBase64(await file.arrayBuffer());
  const uuid = await agentClient.prepareSkillInstall(base64);
  await openInCurrentTab(`/src/install.html?skill=${uuid}`);
}

async function installLocalFile(file: File, handle: FileSystemFileHandle | null): Promise<void> {
  const code = await file.text();
  if (!parseMetadata(code)) {
    throw new Error(t("script:not_a_valid_script"));
  }
  if (handle) {
    // 有 FileSystemFileHandle:存 DB 后开 ?file=,安装页可监听本地文件变更
    const fid = uuidv4();
    await saveHandle(fid, handle);
    await openInCurrentTab(`/src/install.html?file=${fid}`);
  } else {
    // 无 handle(<input> 选择等):走 blob URL,由 SW 打开安装页
    const url = await Promise.resolve(
      makeBlobURL({ blob: new Blob([code], { type: "text/javascript" }), persistence: false })
    );
    const result = await scriptClient.importByUrl(url);
    if (!result.success) throw new Error(result.msg);
  }
}

function reportStat(stat: ImportStat, total: number): void {
  if (stat.fail === 0 && total <= 1) return; // 单文件成功:安装页本身即反馈,不打扰
  if (stat.fail === 0) {
    notify.success(t("script:import_done", { success: stat.success, fail: stat.fail }));
  } else {
    notify.error(`${t("script:import_done", { success: stat.success, fail: stat.fail })}\n${stat.messages.join("\n")}`);
  }
}

export async function handleImportFiles(items: ImportItem[]): Promise<ImportStat> {
  const stat: ImportStat = { success: 0, fail: 0, messages: [] };
  await Promise.all(
    items.map(async ({ file, handle }) => {
      try {
        if (EnableAgent && file.name.toLowerCase().endsWith(".zip")) {
          await installSkillZip(file);
        } else {
          await installLocalFile(file, handle);
        }
        stat.success++;
      } catch (e) {
        stat.fail++;
        stat.messages.push((e as Error).message);
      }
    })
  );
  reportStat(stat, items.length);
  return stat;
}

export async function handleImportUrls(urls: string[]): Promise<ImportStat> {
  const stat: ImportStat = { success: 0, fail: 0, messages: [] };
  await Promise.all(
    urls.map(async (url) => {
      try {
        if (EnableAgent && url.toLowerCase().endsWith(".zip")) {
          const uuid = await agentClient.prepareSkillFromUrl(url);
          await openInCurrentTab(`/src/install.html?skill=${uuid}`);
        } else {
          const result = await scriptClient.importByUrl(url);
          if (!result.success) throw new Error(result.msg);
        }
        stat.success++;
      } catch (e) {
        stat.fail++;
        stat.messages.push((e as Error).message);
      }
    })
  );
  reportStat(stat, urls.length);
  return stat;
}
