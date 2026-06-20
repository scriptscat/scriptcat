import { agentClient } from "@App/pages/store/features/script";

/** 将 ArrayBuffer 按字节编码为 base64(用于把 ZIP 二进制传给 SW) */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** 在新标签打开安装页,由安装页消费 ?skill=<uuid> 完成信任优先的安装确认流程 */
export function openSkillInstallPage(uuid: string): void {
  window.open(`/src/install.html?skill=${uuid}`, "_blank");
}

/** 选择 ZIP 文件→预备安装(返回临时 uuid)→打开安装页 */
export async function installSkillFromZip(file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const uuid = await agentClient.prepareSkillInstall(base64);
  openSkillInstallPage(uuid);
}

/** 从 URL 预备安装(返回临时 uuid)→打开安装页 */
export async function installSkillFromUrl(url: string): Promise<void> {
  const uuid = await agentClient.prepareSkillFromUrl(url.trim());
  openSkillInstallPage(uuid);
}
